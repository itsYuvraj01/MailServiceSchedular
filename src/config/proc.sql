CREATE PROCEDURE [dbo].[usp_APP_vs_Sales_Monthly_Pivot]
    @InputDate DATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FY_StartCalYear INT =
        CASE WHEN MONTH(@InputDate) >= 4 THEN YEAR(@InputDate)
             ELSE YEAR(@InputDate) - 1 END;

    DECLARE @FinancialYear VARCHAR(10) =
        CAST(@FY_StartCalYear AS VARCHAR(4))
        + RIGHT(CAST(@FY_StartCalYear + 1 AS VARCHAR(4)), 2);

    DECLARE @StartYear     INT  = @FY_StartCalYear;
    DECLARE @FYStartStr CHAR(8) = CAST(@StartYear AS CHAR(4)) +
 '0401';
    DECLARE @FYEndStr   CHAR(8);
    SET @FYEndStr = FORMAT(DATEADD(DAY, -1, @InputDate), 'yyyyMMdd');

    DECLARE @CurrFYMonth INT =
        CASE WHEN MONTH(@InputDate) >= 4
             THEN MONTH(@InputDate) - 3
             ELSE MONTH(@Input
Date) + 9 END;

    DECLARE @ShowUptoFYMonth INT = @CurrFYMonth;
    DECLARE @CumUptoFYMonth  INT = @CurrFYMonth - 1;
    IF @CumUptoFYMonth  < 1 SET @CumUptoFYMonth  = 0;
    IF @ShowUptoFYMonth < 1 SET @ShowUptoFYMonth = 1;

    IF OBJECT_ID('tempdb..#C
M_All')   IS NOT NULL DROP TABLE #CM_All;
    IF OBJECT_ID('tempdb..#CM_Lead')  IS NOT NULL DROP TABLE #CM_Lead;
    IF OBJECT_ID('tempdb..#Fy')       IS NOT NULL DROP TABLE #Fy;
    IF OBJECT_ID('tempdb..#FyAttr')   IS NOT NULL DROP TABLE #FyAttr;
    IF
 OBJECT_ID('tempdb..#AppMap')   IS NOT NULL DROP TABLE #AppMap;
    IF OBJECT_ID('tempdb..#AppTypes') IS NOT NULL DROP TABLE #AppTypes;
    IF OBJECT_ID('tempdb..#Sales')    IS NOT NULL DROP TABLE #Sales;
    IF OBJECT_ID('tempdb..#CustZone') IS NOT NULL 
DROP TABLE #CustZone;
    IF OBJECT_ID('tempdb..#SalesApp') IS NOT NULL DROP TABLE #SalesApp;
    IF OBJECT_ID('tempdb..#Final')    IS NOT NULL DROP TABLE #Final;
    IF OBJECT_ID('tempdb..#Pivoted')  IS NOT NULL DROP TABLE #Pivoted;

    BEGIN TRY

    /
* ==================================================================
       STAGE 1 : pccoord_app_fy – read ONCE, keys normalised ONCE
       AU_T aliased as AU_Trader and carried through every stage.
    ==================================================
================ */
    SELECT
        RIGHT('0000000000' + LTRIM(RTRIM(Sold_To_Party)), 10) AS Sold_To_Party,
        Customer_Name,
        Field_Officer,
        LTRIM(RTRIM(AU_T))                                     AS AU_Trader,   -- AU flag
        
RIGHT('0000' + LTRIM(RTRIM(CAST(Zo_Code AS VARCHAR(10)))), 4) AS Zo_Code,
        Zo_Name,
        Parent_Code,
        LTRIM(RTRIM(Parent_Description))                       AS Parent_Description,
        App_Type,
        App_code,
        [Month],
    
    CAST(Quantity AS NUMERIC(18,3))                        AS Quantity
    INTO #Fy
    FROM pccoord_app_fy
    WHERE [Year] = @FinancialYear;

    /* AU_Trader is an attribute, NOT a lookup key -> keep it out of the
       clustered index key to avoid bl
oating every index page            */
    CREATE CLUSTERED INDEX IX_Fy
        ON #Fy (Sold_To_Party, Parent_Code, Parent_Description, App_Type, [Month]);

    /* Per-customer fallback attributes – include AU_Trader */
    SELECT
        f.Sold_To_Party,

        MAX(f.Field_Officer) AS Field_Officer,
        MAX(f.Zo_Code)       AS Zo_Code,
        MAX(f.Zo_Name)       AS Zo_Name,
        MAX(f.AU_Trader)     AS AU_Trader
    INTO #FyAttr
    FROM #Fy f
    GROUP BY f.Sold_To_Party;

    CREATE UNIQUE CLU
STERED INDEX IX_FyAttr ON #FyAttr (Sold_To_Party);

    /* One APP type per customer + parent + grade */
    SELECT Sold_To_Party, Parent_Code, Grade, App_Type
    INTO #AppMap
    FROM (
        SELECT
            Sold_To_Party, Parent_Code,
            
Parent_Description AS Grade,
            App_Type,
            ROW_NUMBER() OVER (
                PARTITION BY Sold_To_Party, Parent_Code, Parent_Description
                ORDER BY MAX(App_code) DESC, App_Type DESC
            ) AS rn
        FROM #Fy

        GROUP BY Sold_To_Party, Parent_Code, Parent_Description, App_Type
    ) x
    WHERE rn = 1;

    CREATE UNIQUE CLUSTERED INDEX IX_AppMap ON #AppMap (Sold_To_Party, Parent_Code, Grade);

    SELECT DISTINCT Sold_To_Party, App_Type
    INTO #AppType
s
    FROM #Fy;

    CREATE UNIQUE CLUSTERED INDEX IX_AppTypes ON #AppTypes (Sold_To_Party, App_Type);


    /* ==================================================================
       STAGE 1b : Group master
       #CM_All  – every member mapped to its 
GROUP_KEY
       #CM_Lead – one row per GROUP_KEY carrying the group name
                  (GROUP_KEY itself used as the display name;
                   no lead-customer concept)
    ================================================================== */

    SELECT cm.GROUP_KEY, cm.SOLD_TO_PARTY, cm.FINANCIAL_YEAR
    INTO #CM_All
    FROM dbo.pccoord_app_fy_group_comp_master AS cm
    WHERE cm.FINANCIAL_YEAR = @FinancialYear;

    CREATE INDEX IX_CM_All ON #CM_All (SOLD_TO_PARTY, FINANCIAL_YEAR);

    /*
 Distinct group keys – GROUP_KEY is the Group_Name */
    SELECT DISTINCT GROUP_KEY, GROUP_KEY AS Group_Name
    INTO #CM_Lead
    FROM dbo.pccoord_app_fy_group_comp_master
    WHERE FINANCIAL_YEAR = @FinancialYear;

    CREATE UNIQUE INDEX IX_CM_Lead ON 
#CM_Lead (GROUP_KEY);

    /* ==================================================================
       STAGE 2 : Invoices – read ONCE, sargable date range, semi-join
    ================================================================== */
    SELECT
   
     s.MAT_GRADE_CODE,
        gm.Parent_Code,
        gm.Grade_Short_Name,
        z.Zo_Short_Name                                          AS ZO_NAME,
        s.CUST_NAME,
        s.SOLD_TO                                                AS Sold_to,
    
    CASE WHEN MONTH(CAST(s.INVOICE_DATE AS DATE)) >= 4
             THEN MONTH(CAST(s.INVOICE_DATE AS DATE)) - 3
             ELSE MONTH(CAST(s.INVOICE_DATE AS DATE)) + 9 END   AS FY_Month,
        SUM(COALESCE(TRY_CONVERT(NUMERIC(18,3),
                 
                LTRIM(RTRIM(s.NET_WT_MT))), 0)) AS TotalSales
    INTO #Sales
    FROM [CVTMS].[dbo].[VW_T_ZVINV_DOWNLD] s
    JOIN [CVTMS].[dbo].pccoord_grade_master gm
      ON s.MAT_GRADE_CODE = gm.Grade_Code
    JOIN [CVTMS].[dbo].[pccoord_zone_master
] z
      ON z.Zo_Code = s.SALES_REGION
    WHERE s.INVOICE_DATE >= @FYStartStr
      AND s.INVOICE_DATE <= @FYEndStr
      AND s.DIST_CHANNEL  = 'CO'
      AND z.Zo_Short_Name IS NOT NULL
      AND EXISTS (SELECT 1 FROM #FyAttr fc WHERE fc.Sold_To_Party 
= s.SOLD_TO)
    GROUP BY
        s.MAT_GRADE_CODE, gm.Parent_Code, gm.Grade_Short_Name,
        z.Zo_Short_Name, s.CUST_NAME, s.SOLD_TO,
        CASE WHEN MONTH(CAST(s.INVOICE_DATE AS DATE)) >= 4
             THEN MONTH(CAST(s.INVOICE_DATE AS DATE)) - 3

             ELSE MONTH(CAST(s.INVOICE_DATE AS DATE)) + 9 END;

    CREATE CLUSTERED INDEX IX_Sales
        ON #Sales (Sold_to, Parent_Code, Grade_Short_Name, FY_Month);

    SELECT Sold_to, MAX(ZO_NAME) AS ZO_NAME
    INTO #CustZone
    FROM #Sales
    G
ROUP BY Sold_to;

    CREATE UNIQUE CLUSTERED INDEX IX_CustZone ON #CustZone (Sold_to);

    /* ==================================================================
       STAGE 3 : Sales × APP-type catalogue, filtered to signed APP types
    ==============
==================================================== */
    SELECT
        s.Sold_to, s.CUST_NAME, s.Parent_Code,
        s.Grade_Short_Name, a.App_Description,
        s.FY_Month, s.TotalSales
    INTO #SalesApp
    FROM #Sales s
    JOIN (
        SELEC
T DISTINCT PMap.Parent_Code, app_type.App_Description
        FROM   pccord_app_parent_map  PMap
        JOIN   pccord_app_type_master app_type
          ON   app_type.App_Code = PMap.App_Code
        WHERE  app_type.App_Year = @FinancialYear
    ) a ON a
.Parent_Code = s.Parent_Code
    WHERE EXISTS (
        SELECT 1 FROM #AppTypes t
        WHERE  t.Sold_To_Party = s.Sold_to
          AND  t.App_Type      = a.App_Description
    );

    CREATE CLUSTERED INDEX IX_SalesApp
        ON #SalesApp (Sold_to, P
arent_Code, Grade_Short_Name, App_Description, FY_Month);

    /* ==================================================================
       STAGE 4 : FULL JOIN – sales vs targets
       AU_Trader comes from the #Fy (target) side via COALESCE.
    ========
========================================================== */
    SELECT
        COALESCE(s.Sold_to,          f.Sold_To_Party)       AS Sold_to,
        COALESCE(s.CUST_NAME,        f.Customer_Name)       AS CUST_NAME,
        f.AU_Trader                 
                        AS AU_Trader,  -- from APP record
        COALESCE(s.Parent_Code,      f.Parent_Code)         AS Parent_Code,
        COALESCE(s.Grade_Short_Name, f.Parent_Description)  AS Grade,
        COALESCE(m.App_Type, s.App_Description, f.A
pp_Type) AS App_Type,
        COALESCE(s.FY_Month,         f.[Month])             AS FY_Month,
        COALESCE(s.TotalSales, 0)                           AS TotalSales,
        COALESCE(f.Quantity,   0)                           AS TotalTarget,
        /
* Group_Name: lead customer name for grouped customers,
           NULL for standalone */
        ca2.GROUP_KEY                                       AS Group_Name
    INTO #Final
    FROM #SalesApp s
    FULL JOIN #Fy f
      ON  f.Sold_To_Party      = s
.Sold_to
      AND f.Parent_Code        = s.Parent_Code
      AND f.Parent_Description = s.Grade_Short_Name
      AND f.App_Type           = s.App_Description
      AND f.[Month]            = s.FY_Month
    LEFT JOIN #AppMap m
      ON  m.Sold_To_Party = 
COALESCE(s.Sold_to,          f.Sold_To_Party)
      AND m.Parent_Code   = COALESCE(s.Parent_Code,      f.Parent_Code)
      AND m.Grade         = COALESCE(s.Grade_Short_Name, f.Parent_Description)
    LEFT JOIN #CM_All ca2
      ON  ca2.SOLD_TO_PARTY = CO
ALESCE(s.Sold_to, f.Sold_To_Party)
      AND ca2.FINANCIAL_YEAR = @FinancialYear


    /* ==================================================================
       STAGE 5 : Dedup + pivot into #Pivoted
       AU_Trader added to GROUP BY so it is preserved
 per row.
    ================================================================== */
    ;WITH DedupData AS
    (
        SELECT
            fl.*,
            ca.Field_Officer,
            COALESCE(fl.AU_Trader, ca.AU_Trader)                    AS AU_Trade
r_resolved,
            COALESCE(cz.ZO_NAME, z2.Zo_Short_Name, ca.Zo_Name)     AS ZO_NAME,
            ROW_NUMBER() OVER (
                PARTITION BY fl.Sold_to, fl.Parent_Code, fl.Grade, fl.FY_Month
                ORDER BY CASE WHEN fl.TotalTarget > 0
 THEN 0 ELSE 1 END, fl.App_Type
            ) AS SalesRN
        FROM #Final fl
        LEFT JOIN #FyAttr   ca ON ca.Sold_To_Party = fl.Sold_to
        LEFT JOIN #CustZone cz ON cz.Sold_to       = fl.Sold_to
        LEFT JOIN [CVTMS].[dbo].[pccoord_zone_m
aster] z2 ON z2.Zo_Code = ca.Zo_Code
    )
    SELECT
        ZO_NAME,
        MAX(Field_Officer) AS Field_Officer,           -- ✅ Aggregated, not grouped
        AU_Trader_resolved AS AU_Trader,
        Group_Name,
        MAX(CUST_NAME)     AS CUST_NAME
,               -- ✅ Aggregated, not grouped
        Sold_to, App_Type, Grade, Parent_Code,

        SUM(CASE WHEN FY_Month =  1 THEN TotalTarget ELSE 0 END) AS M1_Qty,
        SUM(CASE WHEN FY_Month =  1 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M1_
Sales,
        SUM(CASE WHEN FY_Month =  2 THEN TotalTarget ELSE 0 END) AS M2_Qty,
        SUM(CASE WHEN FY_Month =  2 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M2_Sales,
        SUM(CASE WHEN FY_Month =  3 THEN TotalTarget ELSE 0 END) AS M3_Qty,
   
     SUM(CASE WHEN FY_Month =  3 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M3_Sales,
        SUM(CASE WHEN FY_Month =  4 THEN TotalTarget ELSE 0 END) AS M4_Qty,
        SUM(CASE WHEN FY_Month =  4 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M4_Sal
es,
        SUM(CASE WHEN FY_Month =  5 THEN TotalTarget ELSE 0 END) AS M5_Qty,
        SUM(CASE WHEN FY_Month =  5 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M5_Sales,
        SUM(CASE WHEN FY_Month =  6 THEN TotalTarget ELSE 0 END) AS M6_Qty,
      
  SUM(CASE WHEN FY_Month =  6 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M6_Sales,
        SUM(CASE WHEN FY_Month =  7 THEN TotalTarget ELSE 0 END) AS M7_Qty,
        SUM(CASE WHEN FY_Month =  7 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M7_Sales,

        SUM(CASE WHEN FY_Month =  8 THEN TotalTarget ELSE 0 END) AS M8_Qty,
        SUM(CASE WHEN FY_Month =  8 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M8_Sales,
        SUM(CASE WHEN FY_Month =  9 THEN TotalTarget ELSE 0 END) AS M9_Qty,
        S
UM(CASE WHEN FY_Month =  9 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M9_Sales,
        SUM(CASE WHEN FY_Month = 10 THEN TotalTarget ELSE 0 END) AS M10_Qty,
        SUM(CASE WHEN FY_Month = 10 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M10_Sales,

        SUM(CASE WHEN FY_Month = 11 THEN TotalTarget ELSE 0 END) AS M11_Qty,
        SUM(CASE WHEN FY_Month = 11 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M11_Sales,
        SUM(CASE WHEN FY_Month = 12 THEN TotalTarget ELSE 0 END) AS M12_Qty,
       
 SUM(CASE WHEN FY_Month = 12 AND SalesRN = 1 THEN TotalSales ELSE 0 END) AS M12_Sales,

        SUM(CASE WHEN FY_Month <= @CumUptoFYMonth THEN TotalTarget ELSE 0 END) AS Cum_Qty,
        SUM(CASE WHEN FY_Month <= @CumUptoFYMonth AND SalesRN = 1
          
       THEN TotalSales ELSE 0 END)                                    AS Cum_Sales
    INTO #Pivoted
    FROM DedupData
    GROUP BY
        ZO_NAME, 
        AU_Trader_resolved,
        Group_Name,                  -- NULL for standalone, lead name for g
roup
         Sold_to, App_Type, Grade, Parent_Code
    HAVING SUM(TotalTarget) <> 0
        OR SUM(CASE WHEN SalesRN = 1 THEN TotalSales ELSE 0 END) <> 0;

    /* ==================================================================
       STAGE 6 : Dynamic
 month columns
    ================================================================== */
    DECLARE @MonthCols NVARCHAR(MAX) = N'';
    DECLARE @m INT = 1, @CalMonth INT, @CalYear INT;
    DECLARE @Lbl NVARCHAR(10), @Col NVARCHAR(10);

    WHILE @m <= @S
howUptoFYMonth
    BEGIN
        SET @CalMonth = CASE WHEN @m <= 9 THEN @m + 3 ELSE @m - 9 END;
        SET @CalYear  = CASE WHEN @m <= 9 THEN @StartYear ELSE @StartYear + 1 END;
        SET @Lbl = LEFT(DATENAME(MONTH, DATEFROMPARTS(@CalYear, @CalMonth, 1
)), 3)
                   + N'''' + RIGHT(CAST(@CalYear AS NVARCHAR(4)), 2);
        SET @Col = N'M' + CAST(@m AS NVARCHAR(2));

        SET @MonthCols = @MonthCols + N'
    ' + @Col + N'_Qty   AS [' + @Lbl + N' APP Qty],
    ' + @Col + N'_Sales AS [' + @
Lbl + N' Sales],
    CASE WHEN ' + @Col + N'_Qty > 0
         THEN ROUND(' + @Col + N'_Sales / ' + @Col + N'_Qty * 100.0, 2)
         ELSE 0 END    AS [' + @Lbl + N' APP %],';

        SET @m = @m + 1;
    END

    /* AU_Trader added to the static part of
 the SELECT                 */
    DECLARE @sql NVARCHAR(MAX) = N'
SELECT
	Group_Name         AS [Group Name],
    ZO_NAME            AS [Zone Name],
    Field_Officer      AS [Field Officer Name],
    AU_Trader          AS [AU/T],   
    CUST_NAME       
   AS [Name of the Customer],
    Sold_to            AS [Sold to Party],
    App_Type           AS [APP Type],
    Grade,'
    + @MonthCols + N'
    Cum_Qty   AS [Total till Prev Month APP Qty],
    Cum_Sales AS [Total till Prev Month Sales],
    CASE WHE
N Cum_Qty > 0
         THEN ROUND(Cum_Sales / Cum_Qty * 100.0, 2)
         ELSE 0 END AS [Total till Prev Month APP %]
FROM #Pivoted
ORDER BY [Group Name],[Zone Name], [Field Officer Name], CUST_NAME, [APP Type], Parent_Code, Grade asc;';

    EXEC sys.sp
_executesql @sql;

    END TRY
    BEGIN CATCH
        DECLARE @ErrMsg  NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrLine INT            = ERROR_LINE();
        RAISERROR(N'usp_APP_vs_Sales_Monthly_Pivot failed at line %d: %s',
                  
16, 1, @ErrLine, @ErrMsg);
    END CATCH;
END;
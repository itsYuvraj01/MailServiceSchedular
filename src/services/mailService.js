const path = require('path');
const nodemailer = require('nodemailer');
const config = require('../config/config');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: config.mail.host,
  port: config.mail.port,
  secure: config.mail.secure,
  auth: {
    user: config.mail.user,
    pass: config.mail.pass
  }
});

/**
 * Sends an email using Nodemailer
 * @param {Object} options - Email options
 * @param {string} [options.to] - Recipient email addresses
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML body
 * @param {Array<Object>} [options.attachments] - File attachments
 */
const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  const footerImagePath = path.join(__dirname, '../Images/footerImage.jpg');

  // Embed footer logo as inline attachment
  const defaultAttachments = [
    {
      filename: 'footerImage.jpg',
      path: footerImagePath,
      cid: 'footerLogo'
    }
  ];

  const allAttachments = [...defaultAttachments, ...attachments];

  const mailOptions = {
    from: config.mail.from,
    to: to || config.mail.recipients,
    subject: subject,
    html: html,
    attachments: allAttachments
  };

  const info = await transporter.sendMail(mailOptions);
  logger.info(`Email sent successfully: ${info.messageId}`);
  return info;
};

module.exports = { sendEmail, transporter };

// Simple PDF certificate generator (pdfkit). Streams straight to the response.
const PDFDocument = require('pdfkit');

function streamCertificate(res, { studentName, studentEmail, courseTitle, completedAt }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="certificate-${courseTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width;
  const H = doc.page.height;

  // background + double border
  doc.rect(0, 0, W, H).fill('#0c0a09');
  doc.lineWidth(3).strokeColor('#f59e0b').rect(24, 24, W - 48, H - 48).stroke();
  doc.lineWidth(1).strokeColor('#78716c').rect(34, 34, W - 68, H - 68).stroke();

  doc.fillColor('#f59e0b').font('Helvetica-Bold').fontSize(14)
    .text('LESSONFORGE', 0, 74, { align: 'center', characterSpacing: 6 });

  doc.fillColor('#fafaf9').font('Helvetica-Bold').fontSize(38)
    .text('Certificate of Completion', 0, 120, { align: 'center' });

  doc.fillColor('#a8a29e').font('Helvetica').fontSize(15)
    .text('This certifies that', 0, 190, { align: 'center' });

  doc.fillColor('#fafaf9').font('Helvetica-Bold').fontSize(30)
    .text(studentName || studentEmail, 60, 220, { align: 'center', width: W - 120 });

  doc.fillColor('#a8a29e').font('Helvetica').fontSize(15)
    .text('has successfully completed the course', 0, 272, { align: 'center' });

  doc.fillColor('#f59e0b').font('Helvetica-Bold').fontSize(24)
    .text(courseTitle, 60, 302, { align: 'center', width: W - 120 });

  const date = new Date(completedAt || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  doc.fillColor('#a8a29e').font('Helvetica').fontSize(13)
    .text(`Completed on ${date}`, 0, 360, { align: 'center' });

  // signature line
  const lineY = H - 130;
  doc.moveTo(W / 2 - 120, lineY).lineTo(W / 2 + 120, lineY).lineWidth(1).strokeColor('#78716c').stroke();
  doc.fillColor('#78716c').fontSize(11).text('Instructor', 0, lineY + 8, { align: 'center' });

  doc.end();
}

module.exports = { streamCertificate };

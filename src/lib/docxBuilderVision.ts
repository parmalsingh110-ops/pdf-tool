import { Document, Paragraph, TextRun, AlignmentType, UnderlineType } from 'docx';
import { DocumentLayoutResponse } from './advancedVisionEngine';

export function buildDocxFromVisionJSON(data: DocumentLayoutResponse): Document {
  const children: Paragraph[] = [];

  // Helper functions
  const sanitize = (s: string) => String(s || '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  const boldRun = (text: string, size = 22) => new TextRun({ text: sanitize(text), bold: true, size });
  const normalRun = (text: string, size = 22) => new TextRun({ text: sanitize(text), size });
  const sp = (after = 200) => ({ spacing: { after } });

  // TITLE
  (data.title_lines || []).forEach(line => {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      ...sp(60),
      children: [new TextRun({ text: sanitize(line), bold: true, size: 24 })]
    }));
  });

  // DIARY NO
  if (data.diary_no) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      ...sp(220),
      children: [
        normalRun('DIARY NO: -  '),
        new TextRun({ text: sanitize(data.diary_no), size: 22, underline: { type: UnderlineType.SINGLE } })
      ]
    }));
  }

  // NOTES (a), (b)
  (data.notes || []).forEach(note => {
    children.push(new Paragraph({ ...sp(80), children: [normalRun(note)] }));
  });
  if (data.notes && data.notes.length > 0) {
    children.push(new Paragraph({ ...sp(200), children: [normalRun('')] }));
  }

  // FIELDS — Train, Date, Class, Seats on one line
  const trainFields = (data.fields || []).filter(f => 
    ['TRAIN NO', 'D.O.J', 'CLASS', 'NO OF SEATS'].some(k => sanitize(f.label).includes(k))
  );
  if (trainFields.length) {
    const runs: TextRun[] = [];
    trainFields.forEach(f => {
      runs.push(normalRun(f.label + ' '));
      runs.push(f.bold_value ? boldRun(f.value + '  ') : normalRun(f.value + '  '));
    });
    children.push(new Paragraph({ ...sp(180), children: runs }));
  }

  // FROM / TO / BOARDING
  const fromField = (data.fields || []).find(f => sanitize(f.label).includes('FROM'));
  const toField = (data.fields || []).find(f => sanitize(f.label).includes('TO'));
  const boardingField = (data.fields || []).find(f => sanitize(f.label).includes('BOARDING'));
  if (fromField || toField) {
    children.push(new Paragraph({
      ...sp(180),
      children: [
        normalRun('FROM: - '), boldRun(fromField?.value || ''),
        normalRun('  TO  '), boldRun(toField?.value || ''),
        new TextRun({ text: '          BOARDING AT: - ', size: 22 }),
        boldRun(boardingField?.value || '')
      ]
    }));
  }

  // PNR / DATE OF BOOKING
  const pnrField = (data.fields || []).find(f => sanitize(f.label).includes('PNR'));
  const dobField = (data.fields || []).find(f => sanitize(f.label).includes('TICKET BOOKING') || sanitize(f.label).includes('DATE OF TICKET'));
  if (pnrField) {
    children.push(new Paragraph({
      ...sp(260),
      children: [
        normalRun('PNR NO: - '), boldRun(pnrField.value),
        normalRun('  DATE OF TICKET BOOKING: - '), boldRun(dobField?.value || '')
      ]
    }));
  }

  // PASSENGERS
  if (data.passengers && data.passengers.length > 0) {
    children.push(new Paragraph({
      ...sp(80),
      children: [normalRun('NAME OF PASSENGERS: - '), boldRun(data.passengers[0])]
    }));
    for (let i = 1; i < data.passengers.length; i++) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        ...sp(260),
        children: [boldRun(data.passengers[i])]
      }));
    }
  }

  // MOBILE
  if (data.mobile) {
    children.push(new Paragraph({
      ...sp(240),
      children: [normalRun('MOBILE NO OF PASSENGERS: - '), boldRun(data.mobile)]
    }));
  }

  // RELATION
  if (data.relation) {
    children.push(new Paragraph({
      ...sp(240),
      children: [normalRun('RELATION WITH PASSENGER: - '), boldRun(data.relation)]
    }));
  }

  // PURPOSE
  if (data.purpose) {
    children.push(new Paragraph({
      ...sp(240),
      children: [normalRun('PURPOSE OF JOURNEY: - '), boldRun(data.purpose)]
    }));
  }

  // REFERENCE
  if (data.reference) {
    children.push(new Paragraph({
      ...sp(360),
      children: [normalRun('REFERENCE REQUEST: - '), boldRun(data.reference)]
    }));
  }

  // SIGNATURE LINE
  children.push(new Paragraph({
    ...sp(140),
    children: [normalRun((data.signature_line || 'SIGNATURE & STAMP OF GAZETTED OFFICER: -') + 
      ' ................................................')]
  }));

  // STAMP LINES (right aligned)
  (data.stamp_lines || []).forEach(line => {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      ...sp(60),
      children: [new TextRun({ text: sanitize(line), size: 22 })]
    }));
  });
  
  if (data.stamp_lines && data.stamp_lines.length > 0) {
    children.push(new Paragraph({ ...sp(200), children: [normalRun('')] }));
  }

  // NOTE
  children.push(new Paragraph({ ...sp(80), children: [boldRun(data.note_label || 'NOTE: -')] }));
  (data.note_items || []).forEach(item => {
    children.push(new Paragraph({ ...sp(80), children: [normalRun(item)] }));
  });

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
        }
      },
      children
    }]
  });
}

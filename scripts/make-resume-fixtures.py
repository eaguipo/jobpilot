# Regenerate with: python3 scripts/make-resume-fixtures.py e2e/fixtures
"""Writes small made-up resume files for tests: a text PDF, a DOCX, and a PDF with no text."""
import sys, zipfile, os
out = sys.argv[1]
LINES = [
    "Jordan Reyes - Frontend Engineer",
    "jordan.reyes@example.com",
    "EXPERIENCE",
    "Tailspin Toys (2021-present) - Senior Frontend Engineer",
    "- Built React and TypeScript storefronts with Next.js for 300k shoppers.",
    "- Cut checkout page load time by 40% with server rendering.",
    "Fabrikam (2018-2021) - Frontend Engineer",
    "- Ran accessibility reviews and the shared component library.",
    "SKILLS: React, TypeScript, Next.js, CSS, Jest, accessibility",
]

def pdf(path, lines):
    def esc(s): return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    body = "BT /F1 11 Tf 50 780 Td 14 TL\n" + "".join(f"({esc(l)}) Tj T*\n" for l in lines) + "ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        f"<< /Length {len(body)} >>\nstream\n{body}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    data = b"%PDF-1.4\n"
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(data))
        data += f"{i} 0 obj\n{o}\nendobj\n".encode("latin-1")
    xref = len(data)
    data += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        data += f"{off:010d} 00000 n \n".encode()
    data += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    open(path, "wb").write(data)

def docx(path, lines):
    from xml.sax.saxutils import escape
    paras = "".join(f"<w:p><w:r><w:t xml:space=\"preserve\">{escape(l)}</w:t></w:r></w:p>" for l in lines)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        z.writestr("word/document.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{paras}</w:body></w:document>')

pdf(os.path.join(out, "resume.pdf"), LINES)
pdf(os.path.join(out, "scanned.pdf"), [])  # a page with no text, like a scanned image
docx(os.path.join(out, "resume.docx"), LINES)

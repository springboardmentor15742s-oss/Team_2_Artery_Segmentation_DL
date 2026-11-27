"""Export the project explanation Markdown as a Word document using stdlib only."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape
import re

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / "docs" / "PROJECT_EXPLANATION_GUIDE.md"
POSTER = ROOT / "docs" / "architecture" / "artery_project_poster_a3.png"
OUTPUT = ROOT / "docs" / "PROJECT_EXPLANATION_GUIDE.docx"

def p(text, style="Normal"):
    return f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr><w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'

def image_paragraph():
    cx = 5943600
    cy = int(cx * 3508 / 4960)
    return f'''<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="1" name="Project poster"/>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="artery_project_poster_a3.png"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
        </a:graphicData></a:graphic>
      </wp:inline></w:drawing></w:r></w:p>'''

def markdown_to_word():
    parts = []
    in_image = False
    for raw in GUIDE.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if not line.strip() or line.strip() == "---":
            continue
        if line.startswith("!["):
            parts.append(image_paragraph())
            continue
        if line.startswith("# "):
            parts.append(p(line[2:], "Title"))
        elif line.startswith("## "):
            parts.append(p(line[3:], "Heading1"))
        elif line.startswith("### "):
            parts.append(p(line[4:], "Heading2"))
        elif line.startswith("|"):
            if re.fullmatch(r"[|\s:-]+", line):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            parts.append(p("    |    ".join(cells), "TableText"))
        elif line.startswith("- "):
            parts.append(p("• " + line[2:], "Normal"))
        elif line.startswith("    "):
            parts.append(p(line.strip(), "CodeBlock"))
        else:
            plain = re.sub(r"\*\*(.*?)\*\*", r"\1", line)
            plain = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 — \2", plain)
            parts.append(p(plain, "Normal"))

    sect = '''<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr>'''
    doc = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <w:body>{''.join(parts)}{sect}</w:body></w:document>'''
    return doc

styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="20"/><w:color w:val="334155"/></w:rPr><w:pPr><w:spacing w:after="120" w:line="280" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="38"/><w:color w:val="123B5D"/></w:rPr><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="146B82"/></w:rPr><w:pPr><w:keepNext/><w:spacing w:before="380" w:after="140"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="23"/><w:color w:val="245477"/></w:rPr><w:pPr><w:keepNext/><w:spacing w:before="250" w:after="100"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="180"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="65"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="17"/></w:rPr><w:pPr><w:spacing w:after="65"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="16"/><w:color w:val="1F497D"/></w:rPr><w:pPr><w:ind w:left="300"/><w:spacing w:after="35"/></w:pPr></w:style>
</w:styles>'''

content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>'''
root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''
doc_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/artery_project_poster_a3.png"/>
</Relationships>'''

if not GUIDE.exists() or not POSTER.exists():
    raise SystemExit("Guide or poster is missing. Generate the poster first.")
with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", root_rels)
    z.writestr("word/document.xml", markdown_to_word())
    z.writestr("word/styles.xml", styles)
    z.writestr("word/_rels/document.xml.rels", doc_rels)
    z.write(POSTER, "word/media/artery_project_poster_a3.png")
print(f"Created {OUTPUT}")

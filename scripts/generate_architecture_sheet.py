from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


OUT = Path(__file__).resolve().parents[1] / "docs" / "architecture"
OUT.mkdir(parents=True, exist_ok=True)
S = 2  # 2480 x 1754 mm-layout pixels rendered at 300 dpi (A3 landscape)
W, H = 2480, 1754
im = Image.new("RGB", (W * S, H * S), "#f5f8fc")
d = ImageDraw.Draw(im)

FONT_DIR = Path("C:/Windows/Fonts")
def font(size, bold=False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    path = FONT_DIR / name
    if not path.exists():
        path = FONT_DIR / ("arialbd.ttf" if bold else "arial.ttf")
    return ImageFont.truetype(str(path), size * S)

def box(x, y, w, h, fill="#ffffff", outline="#d8e2ef", radius=18, width=2):
    d.rounded_rectangle((x*S,y*S,(x+w)*S,(y+h)*S), radius=radius*S, fill=fill, outline=outline, width=width*S)

def txt(x, y, s, size=17, color="#23344d", bold=False, anchor=None):
    d.text((x*S,y*S), s, font=font(size,bold), fill=color, anchor=anchor)

def lines(x, y, items, size=15, color="#425570", leading=25, bullet=True):
    for i, item in enumerate(items):
        yy = y + i*leading
        if bullet:
            d.ellipse(((x)*S,(yy+7)*S,(x+7)*S,(yy+14)*S), fill="#1685b8")
            txt(x+17, yy, item, size, color)
        else:
            txt(x, yy, item, size, color)

def arrow(points, color="#4b83b5", width=4, head=12):
    pts=[(x*S,y*S) for x,y in points]
    d.line(pts, fill=color, width=width*S, joint="curve")
    x1,y1=pts[-2]; x2,y2=pts[-1]
    import math
    a=math.atan2(y2-y1,x2-x1)
    p1=(x2-head*S*math.cos(a-0.5),y2-head*S*math.sin(a-0.5))
    p2=(x2-head*S*math.cos(a+0.5),y2-head*S*math.sin(a+0.5))
    d.polygon([(x2,y2),p1,p2], fill=color)

# Header and print-safe margins.
d.rectangle((0,0,W*S,164*S), fill="#102d4e")
txt(72,34,"AUTOMATED ARTERY ANALYSIS",32,"#ffffff",True)
txt(73,83,"Application architecture · deployment and data flow",19,"#c7def3")
txt(2400,49,"A3  ·  LANDSCAPE  ·  420 × 297 mm",14,"#d7e7f5",True,"ra")
txt(2400,80,"Project architecture based on the included source and Docker configuration",12,"#a9c6df",False,"ra")

# User-facing application.
txt(72,190,"1  ·  USERS & WEB APPLICATION",15,"#1681ad",True)
box(72,222,2336,166,"#ffffff","#b9d0e5")
txt(96,238,"Browser",21,"#173858",True)
txt(96,270,"React 18 · Vite · Tailwind · React Router",15)
txt(96,302,"Doctor / clinician  ·  Patient  ·  Administrator",14,"#61728a")
modules=["Dashboard & cases","Image analysis & upload","Segmentation results","Training & testing","Reports & history","Appointments & messaging","Model registry & audit"]
mx=510
for i,label in enumerate(modules):
    col=i%4; row=i//4
    x=mx+col*458; y=239+row*57
    box(x,y,426,40,"#eef6fc","#d4e5f2",12,1)
    txt(x+14,y+10,label,14,"#234b70",True)

# Nginx gateway row.
arrow([(1240,390),(1240,423)])
box(72,432,2336,112,"#eaf4fb","#9cc2df")
txt(96,449,"2  ·  WEB CONTAINER  ·  NGINX",18,"#155b86",True)
txt(96,481,"Serves the built React app · SPA route fallback · /api reverse proxy to api:8000 · /docs proxy · healthz",15)
txt(96,510,"Docker published port: host 8081 → container 80 (WEB_PORT can override)",13,"#526a83")

# API main layer.
arrow([(1240,546),(1240,580)])
txt(72,575,"3  ·  APPLICATION API  ·  FASTAPI / PYTHON",15,"#1681ad",True)
box(72,604,1578,580,"#ffffff","#b9d0e5")
txt(98,625,"API container · Uvicorn · port 8000 · authenticated REST endpoints",20,"#173858",True)
box(98,675,465,210,"#f3f8fd","#d6e3ef",14,1)
txt(120,694,"Identity & clinical workflow",17,"#1c5279",True)
lines(120,732,["Login, registration, role-aware access","Patient, doctor, case and scan records","Appointments, messages, notifications","Report review, approval and audit events"],14,leading=32)
box(586,675,476,210,"#f3f8fd","#d6e3ef",14,1)
txt(608,694,"Imaging & analysis services",17,"#1c5279",True)
lines(608,732,["Image / DICOM / video upload handling","Quality checks and image preparation","Vessel mask inference and comparison","QCA candidate metrics and report outputs"],14,leading=32)
box(1085,675,535,210,"#f3f8fd","#d6e3ef",14,1)
txt(1107,694,"Supporting application services",17,"#1c5279",True)
lines(1107,732,["CSV / JSON exports and PDF print workflow","Email notifications when SMTP is configured","Clinician assistant and language preferences","/api/health · /metrics · structured logging"],14,leading=32)
box(98,915,1522,236,"#f7fafc","#d6e3ef",14,1)
txt(120,934,"AI inference & evaluation used by the API",17,"#1c5279",True)
lines(120,974,["U-Net / U-Net++ segmentation (available checkpoint is loaded by the inference engine)","QCA feature pipeline and trained classical stenosis classifier (Random Forest)","Model comparison baseline and dataset-split evaluation reports", "ARCade / CADICA research assets when present; results require clinician review"],14,leading=34)

# Data store column.
txt(1690,575,"4  ·  DATA & ARTIFACTS",15,"#1681ad",True)
box(1690,604,718,580,"#ffffff","#b9d0e5")
box(1716,652,666,147,"#eff8f4","#b9ddcb",14,1)
txt(1738,671,"SQLite application database",18,"#236347",True)
lines(1738,709,["Users · scans · cases · reports","Appointments · messages · notifications","Review / audit records"],14,leading=27)
box(1716,816,666,117,"#eff8f4","#b9ddcb",14,1)
txt(1738,833,"Persistent files",18,"#236347",True)
lines(1738,870,["Uploaded studies and generated artifacts","Docker volumes / configured project mounts"],14,leading=27)
box(1716,950,666,204,"#eff8f4","#b9ddcb",14,1)
txt(1738,968,"Research dataset & model files",18,"#236347",True)
lines(1738,1006,["clinical_manifest.csv + image / mask files","training checkpoints, reports, evaluation curves","Dataset copied into API image at build time"],14,leading=31)

# API-to-data arrows.
arrow([(1654,843),(1675,843)])
arrow([(1654,1035),(1675,1035)])

# Training and monitoring bottom band.
txt(72,1212,"5  ·  TRAINING, DEPLOYMENT & OPERATIONS",15,"#1681ad",True)
box(72,1240,1110,330,"#ffffff","#b9d0e5")
txt(98,1261,"Offline model development · training/",19,"#173858",True)
lines(100,1303,["Dataset manifest + image/mask pairs → deterministic train / validation / test splits","train.py and train_segmentation_dl.py → trained model artifacts and training history","test.py / compare_segmentation.py → held-out metrics, confusion matrix, and comparisons","Artifacts are consumed by the API; use the project scripts to retrain or re-evaluate"],14,leading=35)
# A small real-data visual sequence makes this poster readable at a glance.
txt(100,1444,"REAL DATASET EXAMPLE · case_0000",12,"#1681ad",True)
manifest_image = Path(__file__).resolve().parents[1] / "dataset" / "images" / "case_0000.png"
manifest_mask = Path(__file__).resolve().parents[1] / "dataset" / "masks" / "case_0000_mask.png"
if manifest_image.is_file() and manifest_mask.is_file():
    base = Image.open(manifest_image).convert("L")
    mask = Image.open(manifest_mask).convert("L").resize(base.size, Image.Resampling.NEAREST)
    overlay = Image.merge("RGB", (base, base, base))
    tint = Image.new("RGB", base.size, (30, 190, 120))
    overlay = Image.composite(tint, overlay, mask.point(lambda v: 110 if v > 0 else 0))
    thumbs = [(base.convert("RGB"), "Angiogram"), (mask.convert("RGB"), "Reference mask"), (overlay, "Mask overlay")]
    for index, (thumb, caption) in enumerate(thumbs):
        x = 100 + index * 250
        thumb.thumbnail((176*S, 66*S), Image.Resampling.LANCZOS)
        box(x,1470,208,88,"#f3f8fd","#d6e3ef",8,1)
        txt(x+104,1477,caption,10,"#385873",True,"mt")
        im.paste(thumb, (int((x+16)*S),int(1496*S)))
        if index < 2:
            arrow([(x+211,1515),(x+244,1515)], color="#1888ad", width=3, head=9)
box(1210,1240,574,330,"#ffffff","#b9d0e5")
txt(1236,1261,"Docker Compose",19,"#173858",True)
lines(1238,1303,["web + api services","Bridge network and health checks","Persistent data / artifact mounts","Restart policy and container logs"],14,leading=35)
box(1812,1240,596,330,"#ffffff","#b9d0e5")
txt(1838,1261,"Optional monitoring stack",19,"#173858",True)
lines(1840,1303,["Prometheus scrapes API /metrics","Grafana dashboards (port 3001)","Prometheus UI (port 9090)","Configured with docker-compose.monitoring.yml"],14,leading=35)
arrow([(630,1188),(630,1225)])
arrow([(1497,1188),(1497,1225)])
arrow([(1850,1188),(1850,1225)])

# Project-poster summary and integration note.
box(72,1590,2336,88,"#eaf4fb","#b8d1e5",12,1)
txt(96,1598,"PROJECT POSTER · PURPOSE & CAPABILITIES",13,"#155b86",True)
txt(96,1620,"Research-support platform for coronary image review: quality checks → vessel segmentation → stenosis analysis → clinician review and reporting.",13,"#29445f")
txt(96,1646,"Core features: full-dataset results · training / held-out evaluation · patient and doctor workflows · audit trail · deployment monitoring",12,"#425570")
txt(96,1665,"Optional integration: SMTP email alerts when configured. No external AI service is required by the documented local inference flow.",10,"#64748b")
txt(72,1694,"Research-support software. Model outputs, measurements, and overlays require qualified clinician review; they are not a standalone diagnosis.",11,"#64748b")
txt(2408,1694,"Architecture reflects project files; runtime options depend on local configuration.",10,"#64748b",False,"ra")

png = OUT / "artery_project_architecture_a3.png"
pdf = OUT / "artery_project_architecture_a3.pdf"
im.save(png, dpi=(300,300), optimize=True)
im.save(pdf, "PDF", resolution=300.0)
print(f"Created {png} ({im.width}x{im.height}, 300 DPI)")
print(f"Created {pdf}")

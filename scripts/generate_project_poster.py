"""Create a print-ready A3 project poster using project metrics and real data."""
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "architecture"
OUT.mkdir(parents=True, exist_ok=True)
S, W, H = 2, 2480, 1754
canvas = Image.new("RGB", (W*S, H*S), "#f4f7fb")
draw = ImageDraw.Draw(canvas)
FONT_DIR = Path("C:/Windows/Fonts")

def fnt(size, bold=False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    path = FONT_DIR / name
    if not path.exists():
        path = FONT_DIR / ("arialbd.ttf" if bold else "arial.ttf")
    return ImageFont.truetype(str(path), size*S)

def rect(x,y,w,h,fill="#ffffff",stroke="#d7e1ed",radius=18,sw=2):
    draw.rounded_rectangle((x*S,y*S,(x+w)*S,(y+h)*S),radius=radius*S,fill=fill,outline=stroke,width=sw*S)

def text(x,y,value,size=15,color="#34465e",bold=False,anchor=None):
    draw.text((x*S,y*S),value,font=fnt(size,bold),fill=color,anchor=anchor)

def bullet_list(x,y,items,size=14,color="#40536c",step=30):
    for idx,item in enumerate(items):
        yy=y+idx*step
        draw.ellipse((x*S,(yy+7)*S,(x+7)*S,(yy+14)*S),fill="#18a0a7")
        text(x+17,yy,item,size,color)

def arrow(x1,y1,x2,y2,color="#16889a",width=5):
    draw.line((x1*S,y1*S,x2*S,y2*S),fill=color,width=width*S)
    import math
    a=math.atan2(y2-y1,x2-x1); head=13
    p1=(x2*S-head*S*math.cos(a-.55),y2*S-head*S*math.sin(a-.55))
    p2=(x2*S-head*S*math.cos(a+.55),y2*S-head*S*math.sin(a+.55))
    draw.polygon([(x2*S,y2*S),p1,p2],fill=color)

def panel_title(x,y,n,title,color="#14536c"):
    text(x,y,f"{n}  {title}",17,color,True)

# Poster masthead.
draw.rectangle((0,0,W*S,205*S),fill="#102d4e")
text(72,35,"AUTOMATED ARTERY ANALYSIS",34,"#ffffff",True)
text(74,88,"Connected imaging workflow · vessel segmentation · stenosis model evaluation",19,"#d5e8f6")
text(74,132,"A research-support platform for image review and clinician-led reporting",15,"#b7d2e7")
rect(2055,42,338,60,"#17466b","#3a7399",16,1)
text(2224,60,"A3 PROJECT POSTER",15,"#ffffff",True,"mt")
text(2392,126,"ARCHITECTURE  +  DATA  +  RESULTS",12,"#c5d9e9",True,"ra")

# Purpose band.
rect(72,225,2336,104,"#e8f4f7","#c3dfe4",18,1)
text(98,241,"PROJECT AIM",13,"#14798a",True)
text(98,265,"Bring coronary image review, vessel-mask comparison, stenosis-related evaluation, and clinician workflows together in one web application.",16,"#28445f")
text(98,297,"Outputs support review; they are not a standalone diagnosis. A qualified clinician remains responsible for interpretation.",12,"#60758d")

# Key facts; distinct evaluations are explicitly labeled.
cards=[
    (72,"SYNTHETIC MANIFEST CASES","675","472 train  ·  68 validation  ·  135 test","#e8f5f2","#b9dfd5"),
    (856,"STENOSIS CLASSIFIER · TEST","97.78%","Accuracy across 135 held-out cases","#edf3ff","#ccdaf5"),
    (1640,"ARCADE SEGMENTATION · TEST","0.571","Dice across 300 held-out images","#fff5e8","#f0ddbf"),
]
for x,title,value,caption,fill,stroke in cards:
    rect(x,350,768,190,fill,stroke,20,2)
    text(x+24,372,title,13,"#51647c",True)
    text(x+24,407,value,38,"#123c5d",True)
    text(x+24,480,caption,14,"#435b75")
text(1680,512,"Separate dataset/task from classifier benchmark",10,"#7b6043")

# Architecture pipeline.
panel_title(72,570,"1","CONNECTED APPLICATION ARCHITECTURE")
node_y, node_h, node_w = 615, 240, 548
nodes=[
    (72,"01  USERS & WEB APP","React · Vite · React Router",["Doctor / clinician","Patient / administrator","Dashboard · cases · reports","Segmentation results"]),
    (666,"02  NGINX + FASTAPI","Web gateway → REST API",["Nginx serves frontend","/api routes to api:8000","Auth and role checks","Cases · scans · reports"]),
    (1260,"03  ANALYSIS ENGINE","Image processing + models",["Quality checks · QCA features","U-Net vessel segmentation","Random Forest classifier","Clinician review and approval"]),
    (1854,"04  DATA + OPERATIONS","Persistent state + monitoring",["SQLite · uploaded studies","Dataset · masks · checkpoints","Docker health and logs","Prometheus / Grafana optional"]),
]
for x,title,sub,items in nodes:
    rect(x,node_y,node_w,node_h,"#ffffff","#c6d5e5",18,2)
    rect(x,node_y,node_w,50,"#e7f0f8","#e7f0f8",16,0)
    text(x+20,node_y+15,title,15,"#194b70",True)
    text(x+20,node_y+67,sub,13,"#14808a",True)
    bullet_list(x+20,node_y+100,items,13,step=31)
for x in (620,1214,1808):
    arrow(x,node_y+117,x+38,node_y+117)

# Offline training feedback flow.
rect(72,875,2336,117,"#173e5d","#173e5d",18,1)
text(98,892,"OFFLINE TRAINING & ARTIFACT FLOW",13,"#96d8dc",True)
flow=[("DATASET","manifest + images / masks"),("TRAIN / VALIDATE","training scripts + split"),("ARTIFACTS","checkpoints + reports"),("INFERENCE","API loads available files")]
xs=[105,670,1252,1840]
for i,(head,sub) in enumerate(flow):
    text(xs[i],923,head,15,"#ffffff",True)
    text(xs[i],953,sub,12,"#c5dbea")
    if i<3: arrow(xs[i]+388,943,xs[i]+500,943,"#75c5ca",4)
text(2390,978,"Metrics: /api/health · /metrics",10,"#bcd6e6",False,"ra")

# Real example from actual manifest, image, mask and current trained model prediction.
panel_title(72,1020,"2","SYNTHETIC DATASET SEGMENTATION EXAMPLE · CASE case_0000")
image_path=ROOT/"dataset"/"images"/"case_0000.png"
mask_path=ROOT/"dataset"/"masks"/"case_0000_mask.png"
base=Image.open(image_path).convert("L")
reference=Image.open(mask_path).convert("L").resize(base.size,Image.Resampling.NEAREST)
sys.path.insert(0,str(ROOT/"backend"))
from ai_engine import ai_engine_instance
image_array=ai_engine_instance.load_scan_array(image_path)
prediction,_,_=ai_engine_instance.predict_segmentation(image_array)
pred=(np.asarray(prediction)>0)
ref=(np.asarray(reference)>0)
if pred.shape != ref.shape:
    pred=np.asarray(Image.fromarray(pred.astype(np.uint8)*255).resize((ref.shape[1],ref.shape[0]),Image.Resampling.NEAREST))>0
truth=pred & ref
false_pos=pred & ~ref
false_neg=~pred & ref
overlay=np.repeat(np.asarray(base)[...,None],3,axis=2)
overlay[truth]=(30,190,110)
overlay[false_pos]=(240,70,75)
overlay[false_neg]=(55,130,235)
tiles=[
    (base.convert("RGB"),"ORIGINAL ANGIOGRAM"),
    (reference.convert("RGB"),"GROUND-TRUTH MASK"),
    (Image.fromarray(pred.astype(np.uint8)*255).convert("RGB"),"U-NET PREDICTION"),
    (Image.fromarray(overlay),"COMPARISON OVERLAY"),
]
tile_x=[72,405,738,1071]
for i,(img,label) in enumerate(tiles):
    x=tile_x[i]
    rect(x,1058,308,235,"#ffffff","#d2deea",14,1)
    text(x+154,1070,label,11,"#355570",True,"mt")
    img.thumbnail((276*S,177*S),Image.Resampling.LANCZOS)
    canvas.paste(img,(int((x+16)*S),int(1098*S)))
    if i<3: arrow(x+311,1170,x+330,1170,"#16889a",3)
text(72,1303,"Pixel overlay legend",11,"#50647d",True)
for idx,(color,label) in enumerate([("#1ebe6e","True positive"),("#f0464b","False positive"),("#3782eb","False negative")]):
    x=220+idx*180
    draw.rounded_rectangle((x*S,1303*S,(x+15)*S,(1318)*S),radius=3*S,fill=color)
    text(x+23,1301,label,10,"#60758d")

# Main points / features.
rect(1430,1058,978,315,"#ffffff","#d2deea",16,2)
text(1460,1079,"PROJECT MAIN POINTS",16,"#194b70",True)
bullet_list(1460,1120,[
    "Browse all 675 synthetic cases by train / validation / test split",
    "Compare original image, reference mask, prediction, and overlay",
    "Review Dice / IoU per segmentation case",
    "Evaluate stenosis classifier on a separate held-out test split",
    "Manage patient, doctor, appointment, report, and approval workflows",
    "Support image-quality review, DICOM/video paths, and exports",
    "Track API health, logs, and optional Prometheus/Grafana metrics",
],13,step=32)

# Results and responsible interpretation.
rect(72,1400,1120,264,"#ffffff","#c8d7e6",16,2)
text(98,1421,"STENOSIS CLASSIFIER · HELD-OUT TEST (n=135)",14,"#194b70",True)
text(98,1455,"Random Forest   Accuracy 97.78%   ROC-AUC 0.9993",15,"#087c6a",True)
text(98,1490,"Precision 100.00%   Recall 97.25%",14,"#355570")
text(98,1528,"QCA logistic baseline: accuracy 96.30% · ROC-AUC 0.9958",13,"#52677e")
text(98,1560,"Generated synthetic classifier data; separate from ARCADE segmentation.",11,"#7a674c")
text(98,1592,"Values describe this local dataset split and are not clinical validation.",11,"#7a674c")

rect(1220,1400,1188,264,"#fffaf1","#eadabe",16,2)
text(1246,1421,"RESPONSIBLE USE & LIMITATIONS",14,"#8a5a1c",True)
bullet_list(1246,1455,[
    "Research-support outputs need qualified clinician review.",
    "Test-set scores do not guarantee performance on new sites or scanners.",
    "DICOM and video processing depend on supported readers and encodings.",
    "Email requires SMTP configuration; monitoring is an optional Compose stack.",
    "Protect .env, patient records, uploads, database, and backups.",
],12,color="#6e5a43",step=31)

text(72,1697,"A3 · LANDSCAPE · 300 DPI",11,"#64788f",True)
text(2408,1697,"React + FastAPI + SQLite + Docker Compose  |  Clinician-led interpretation",11,"#64788f",False,"ra")

png=OUT/"artery_project_poster_a3.png"
pdf=OUT/"artery_project_poster_a3.pdf"
canvas.save(png,dpi=(300,300),optimize=True)
canvas.save(pdf,"PDF",resolution=300.0)
print(f"Created {png} ({canvas.width}x{canvas.height}, 300 DPI)")
print(f"Created {pdf}")
print(f"Segmentation model shown: {ai_engine_instance.segmentation_model_name}")

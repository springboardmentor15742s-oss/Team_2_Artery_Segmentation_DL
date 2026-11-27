"""Minimal reproducible baseline trainer for ARCADE COCO polygon annotations.

Usage: python train_arcade_baseline.py --data-root ../dataset/ARCADE/data/stenosis --epochs 2
Requires: torch, torchvision, pycocotools, Pillow.
This is a research baseline; it is not for clinical use.
"""
import argparse, json, random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader

class COCOPolygonDataset(Dataset):
    def __init__(self, split_dir, size=256):
        self.root=Path(split_dir); self.size=size
        ann=next((self.root/'annotations').glob('*.json'))
        self.coco=json.loads(ann.read_text(encoding='utf-8'))
        self.images=self.coco['images']; self.byid={x['id']:[] for x in self.images}
        for a in self.coco.get('annotations',[]): self.byid.setdefault(a['image_id'],[]).append(a)
        self.imgdir=self.root/'images'
    def __len__(self): return len(self.images)
    def __getitem__(self,i):
        meta=self.images[i]; p=self.imgdir/meta['file_name']
        im=Image.open(p).convert('L').resize((self.size,self.size))
        mask=Image.new('L',(meta['width'],meta['height']),0); d=ImageDraw.Draw(mask)
        for a in self.byid.get(meta['id'],[]):
            for poly in a.get('segmentation',[]):
                if len(poly)>=6: d.polygon([(poly[j],poly[j+1]) for j in range(0,len(poly)-1,2)],fill=1)
        mask=mask.resize((self.size,self.size),Image.Resampling.NEAREST)
        x=torch.from_numpy(np.asarray(im,dtype=np.float32)[None]/255.)
        y=torch.from_numpy(np.asarray(mask,dtype=np.float32)[None])
        return x,y

class TinyUNet(nn.Module):
    def __init__(self):
        super().__init__()
        def block(a,b): return nn.Sequential(nn.Conv2d(a,b,3,padding=1),nn.ReLU(),nn.Conv2d(b,b,3,padding=1),nn.ReLU())
        self.e1=block(1,16); self.e2=block(16,32); self.pool=nn.MaxPool2d(2)
        self.mid=block(32,64); self.up2=nn.ConvTranspose2d(64,32,2,2); self.d2=block(64,32)
        self.up1=nn.ConvTranspose2d(32,16,2,2); self.d1=block(32,16); self.out=nn.Conv2d(16,1,1)
    def forward(self,x):
        a=self.e1(x); b=self.e2(self.pool(a)); m=self.mid(self.pool(b))
        z=self.d2(torch.cat([self.up2(m),b],1)); z=self.d1(torch.cat([self.up1(z),a],1)); return self.out(z)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--data-root',required=True); ap.add_argument('--epochs',type=int,default=2); ap.add_argument('--batch-size',type=int,default=4); ap.add_argument('--size',type=int,default=256); ap.add_argument('--output',default='artery_arcade_baseline.pt'); args=ap.parse_args()
    root=Path(args.data_root); train=COCOPolygonDataset(root/'train',args.size)
    loader=DataLoader(train,batch_size=args.batch_size,shuffle=True,num_workers=0)
    device='cuda' if torch.cuda.is_available() else 'cpu'; model=TinyUNet().to(device); opt=torch.optim.Adam(model.parameters(),lr=1e-3); lossfn=nn.BCEWithLogitsLoss()
    history=[]
    for ep in range(args.epochs):
        model.train(); total=0
        for x,y in loader:
            x,y=x.to(device),y.to(device); opt.zero_grad(); logits=model(x); loss=lossfn(logits,y); loss.backward(); opt.step(); total+=loss.item()*x.size(0)
        mean=total/len(train); history.append(mean); print(f'epoch {ep+1}/{args.epochs} loss={mean:.5f}')
    out=Path(args.output); torch.save({'model_state_dict':model.cpu().state_dict(),'image_size':args.size,'history':history,'note':'ARCADE research baseline; not clinically validated'},out)
    print('saved',out.resolve())
if __name__=='__main__': main()

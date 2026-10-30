"""Minimal patch-based training entry point for paired NIfTI images/masks.
Expected layout: dataset/images/<case>.nii.gz and dataset/masks/<case>.nii.gz.
This is a starter experiment script, not a validated clinical model.
"""
import argparse, random
from pathlib import Path
import numpy as np
import nibabel as nib
import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader
from model_3d_unet import UNet3D, dice_score_from_logits

class NiftiPatchDataset(Dataset):
    def __init__(self, images_dir, masks_dir, patch=(64,128,128), patches_per_case=8):
        self.images_dir, self.masks_dir = Path(images_dir), Path(masks_dir)
        self.images = sorted([p for p in self.images_dir.iterdir() if p.name.endswith(('.nii','.nii.gz'))])
        if not self.images: raise ValueError(f'No NIfTI images found in {self.images_dir}')
        self.pairs=[]
        for img in self.images:
            mask_name = img.name[:-7] + '.nii.gz' if img.name.endswith('.nii.gz') else img.stem + '.nii.gz'
            mask = self.masks_dir / mask_name
            if not mask.exists():
                mask = self.masks_dir / img.name
            if mask.exists(): self.pairs.append((img,mask))
        if not self.pairs: raise ValueError('No matching image/mask pairs. Use identical case filenames in images/ and masks/.')
        self.patch=tuple(patch); self.indices=[(i,j) for i in range(len(self.pairs)) for j in range(patches_per_case)]
    def __len__(self): return len(self.indices)
    def __getitem__(self, idx):
        image_path, mask_path = self.pairs[self.indices[idx][0]]
        image_obj, mask_obj = nib.load(str(image_path)), nib.load(str(mask_path))
        image=np.asarray(image_obj.dataobj, dtype=np.float32); mask=np.asarray(mask_obj.dataobj)
        if image.ndim != 3 or mask.ndim != 3 or image.shape != mask.shape:
            raise ValueError(f'Shape mismatch or non-3D data: {image_path.name} {image.shape} vs {mask.shape}')
        # Standardize intensity per volume; preserve the label mask as binary.
        finite=np.isfinite(image); image=np.where(finite,image,0)
        vals=image[finite]
        if vals.size:
            lo,hi=np.percentile(vals,[1,99]); image=np.clip(image,lo,hi)
            mean,std=float(image.mean()),float(image.std()); image=(image-mean)/(std+1e-6)
        mask=(mask>0).astype(np.float32)
        starts=[]
        for dim, size in zip(image.shape,self.patch):
            if dim <= size: starts.append(0)
            else: starts.append(random.randint(0,dim-size))
        slices=tuple(slice(st, min(st+sz,dim)) for st,sz,dim in zip(starts,self.patch,image.shape))
        x=image[slices]; y=mask[slices]
        pad=[(0,max(0,sz-d)) for d,sz in zip(x.shape,self.patch)]
        x=np.pad(x,pad,mode='constant'); y=np.pad(y,pad,mode='constant')
        return torch.from_numpy(x[None].copy()), torch.from_numpy(y[None].copy())

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--images',required=True); ap.add_argument('--masks',required=True)
    ap.add_argument('--epochs',type=int,default=10); ap.add_argument('--batch-size',type=int,default=1)
    ap.add_argument('--output',default='artifacts/unet3d_baseline.pt')
    args=ap.parse_args(); device='cuda' if torch.cuda.is_available() else 'cpu'
    ds=NiftiPatchDataset(args.images,args.masks); loader=DataLoader(ds,batch_size=args.batch_size,shuffle=True,num_workers=0)
    model=UNet3D().to(device); opt=torch.optim.Adam(model.parameters(),lr=1e-4); bce=nn.BCEWithLogitsLoss()
    for epoch in range(args.epochs):
        model.train(); losses=[]; dices=[]
        for x,y in loader:
            x,y=x.to(device),y.to(device); opt.zero_grad(); logits=model(x)
            dice_loss=1-dice_score_from_logits(logits,y); loss=bce(logits,y)+dice_loss
            loss.backward(); opt.step(); losses.append(float(loss.detach())); dices.append(float(dice_score_from_logits(logits.detach(),y)))
        print(f'Epoch {epoch+1}/{args.epochs} loss={np.mean(losses):.4f} patch_dice={np.mean(dices):.4f}')
    output=Path(args.output); output.parent.mkdir(parents=True,exist_ok=True)
    torch.save({'model_state_dict':model.state_dict(),'architecture':'UNet3D','base_channels':16,'input_channels':1,'output_channels':1},output)
    print(f'Saved starter checkpoint to {output.resolve()} on {device}. This is not a validated clinical model.')
if __name__=='__main__': main()

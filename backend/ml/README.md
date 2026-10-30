# Research ML starter: 3D U-Net

This folder adds a starter baseline architecture and patch-based training script. It is **not connected to the website API** and is not a clinically validated model.

## Dataset layout

Prepare matching 3D NIfTI images and artery masks, with the same case filename in both folders:

```
dataset/
  images/CASE001.nii.gz
  masks/CASE001.nii.gz
```

Use only data whose terms permit your use. Keep train/validation/test cases separated at the patient level. The starter script currently trains on the supplied images folder only; do not use the test set for training. For a proper experiment, create separate training and validation folders and add validation/checkpoint selection before reporting results.

## Install and run (from this folder)

```
python -m pip install -r requirements-ml.txt
python train_3d_unet.py --images ../../data/train/images --masks ../../data/train/masks --epochs 10 --batch-size 1 --output artifacts/unet3d_baseline.pt
```

Change paths to your actual dataset. 3D volumes can exceed RAM/GPU memory; reduce patch size in the script or use a GPU if needed. Inspect the data axes and physical spacing before training. The sample script is an educational baseline, not a production training framework. It does not implement validation-based early stopping, checkpoint selection, mixed precision, or clinical evaluation.

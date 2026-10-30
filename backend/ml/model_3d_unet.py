"""Research baseline 3D U-Net for binary artery segmentation (PyTorch).
Not wired into the web API; train and validate before any inference integration.
"""
import torch
from torch import nn

class ConvBlock3D(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv3d(in_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm3d(out_channels), nn.ReLU(inplace=True),
            nn.Conv3d(out_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm3d(out_channels), nn.ReLU(inplace=True),
        )
    def forward(self, x): return self.net(x)

class UNet3D(nn.Module):
    """Input/output tensors are [B, C, D, H, W]; output is artery logits."""
    def __init__(self, in_channels=1, out_channels=1, base_channels=16):
        super().__init__()
        b = base_channels
        self.enc1 = ConvBlock3D(in_channels, b)
        self.enc2 = ConvBlock3D(b, b*2)
        self.enc3 = ConvBlock3D(b*2, b*4)
        self.pool = nn.MaxPool3d(2)
        self.bottleneck = ConvBlock3D(b*4, b*8)
        self.up3 = nn.ConvTranspose3d(b*8, b*4, 2, stride=2)
        self.dec3 = ConvBlock3D(b*8, b*4)
        self.up2 = nn.ConvTranspose3d(b*4, b*2, 2, stride=2)
        self.dec2 = ConvBlock3D(b*4, b*2)
        self.up1 = nn.ConvTranspose3d(b*2, b, 2, stride=2)
        self.dec1 = ConvBlock3D(b*2, b)
        self.out = nn.Conv3d(b, out_channels, 1)
    @staticmethod
    def _match(x, ref):
        # Center crop to skip-connection size if odd patch dimensions create a mismatch.
        d, h, w = ref.shape[-3:]
        x = x[..., :d, :h, :w]
        pd, ph, pw = d-x.shape[-3], h-x.shape[-2], w-x.shape[-1]
        if pd > 0 or ph > 0 or pw > 0:
            x = nn.functional.pad(x, (0,max(0,pw),0,max(0,ph),0,max(0,pd)))
        return x
    def forward(self, x):
        e1 = self.enc1(x); e2 = self.enc2(self.pool(e1)); e3 = self.enc3(self.pool(e2))
        z = self.bottleneck(self.pool(e3))
        d3 = self.dec3(torch.cat([self._match(self.up3(z), e3), e3], 1))
        d2 = self.dec2(torch.cat([self._match(self.up2(d3), e2), e2], 1))
        d1 = self.dec1(torch.cat([self._match(self.up1(d2), e1), e1], 1))
        return self.out(d1)

def dice_score_from_logits(logits, target, eps=1e-6):
    probs = torch.sigmoid(logits)
    dims = (1, 2, 3, 4)
    intersection = (probs * target).sum(dims)
    return ((2 * intersection + eps) / (probs.sum(dims) + target.sum(dims) + eps)).mean()

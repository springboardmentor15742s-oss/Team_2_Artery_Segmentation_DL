"""PyTorch U-Net and nested U-Net++ models for 2-D artery mask segmentation.

Install training/requirements_segmentation.txt before importing this module.
"""
import torch
from torch import nn


class ConvBlock(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels), nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels), nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.net(x)


class UNet(nn.Module):
    """Compact encoder-decoder baseline with skip connections."""
    def __init__(self, in_channels=1, out_channels=1, base=16):
        super().__init__()
        self.pool = nn.MaxPool2d(2)
        self.enc0 = ConvBlock(in_channels, base)
        self.enc1 = ConvBlock(base, base * 2)
        self.enc2 = ConvBlock(base * 2, base * 4)
        self.enc3 = ConvBlock(base * 4, base * 8)
        self.bridge = ConvBlock(base * 8, base * 16)
        self.up3 = nn.ConvTranspose2d(base * 16, base * 8, 2, stride=2)
        self.dec3 = ConvBlock(base * 16, base * 8)
        self.up2 = nn.ConvTranspose2d(base * 8, base * 4, 2, stride=2)
        self.dec2 = ConvBlock(base * 8, base * 4)
        self.up1 = nn.ConvTranspose2d(base * 4, base * 2, 2, stride=2)
        self.dec1 = ConvBlock(base * 4, base * 2)
        self.up0 = nn.ConvTranspose2d(base * 2, base, 2, stride=2)
        self.dec0 = ConvBlock(base * 2, base)
        self.head = nn.Conv2d(base, out_channels, 1)

    def forward(self, x):
        x0 = self.enc0(x)
        x1 = self.enc1(self.pool(x0))
        x2 = self.enc2(self.pool(x1))
        x3 = self.enc3(self.pool(x2))
        bridge = self.bridge(self.pool(x3))
        x = self.dec3(torch.cat((self.up3(bridge), x3), 1))
        x = self.dec2(torch.cat((self.up2(x), x2), 1))
        x = self.dec1(torch.cat((self.up1(x), x1), 1))
        x = self.dec0(torch.cat((self.up0(x), x0), 1))
        return self.head(x)


class UNetPlusPlus(nn.Module):
    """Nested skip-path U-Net++ for multi-scale feature aggregation."""
    def __init__(self, in_channels=1, out_channels=1, base=12):
        super().__init__()
        self.pool = nn.MaxPool2d(2)
        c = [base, base * 2, base * 4, base * 8, base * 16]
        self.conv00 = ConvBlock(in_channels, c[0])
        self.conv10 = ConvBlock(c[0], c[1])
        self.conv20 = ConvBlock(c[1], c[2])
        self.conv30 = ConvBlock(c[2], c[3])
        self.conv40 = ConvBlock(c[3], c[4])
        self.up10 = nn.ConvTranspose2d(c[1], c[0], 2, 2)
        self.up20 = nn.ConvTranspose2d(c[2], c[1], 2, 2)
        self.up30 = nn.ConvTranspose2d(c[3], c[2], 2, 2)
        self.up40 = nn.ConvTranspose2d(c[4], c[3], 2, 2)
        self.conv01 = ConvBlock(c[0] * 2, c[0])
        self.conv11 = ConvBlock(c[1] * 2, c[1])
        self.conv21 = ConvBlock(c[2] * 2, c[2])
        self.conv31 = ConvBlock(c[3] * 2, c[3])
        self.conv02 = ConvBlock(c[0] * 3, c[0])
        self.conv12 = ConvBlock(c[1] * 3, c[1])
        self.conv22 = ConvBlock(c[2] * 3, c[2])
        self.conv03 = ConvBlock(c[0] * 4, c[0])
        self.conv13 = ConvBlock(c[1] * 4, c[1])
        self.conv04 = ConvBlock(c[0] * 5, c[0])
        self.head = nn.Conv2d(c[0], out_channels, 1)

    def forward(self, x):
        x00 = self.conv00(x)
        x10 = self.conv10(self.pool(x00))
        x20 = self.conv20(self.pool(x10))
        x30 = self.conv30(self.pool(x20))
        x40 = self.conv40(self.pool(x30))
        x01 = self.conv01(torch.cat((x00, self.up10(x10)), 1))
        x11 = self.conv11(torch.cat((x10, self.up20(x20)), 1))
        x21 = self.conv21(torch.cat((x20, self.up30(x30)), 1))
        x31 = self.conv31(torch.cat((x30, self.up40(x40)), 1))
        x02 = self.conv02(torch.cat((x00, x01, self.up10(x11)), 1))
        x12 = self.conv12(torch.cat((x10, x11, self.up20(x21)), 1))
        x22 = self.conv22(torch.cat((x20, x21, self.up30(x31)), 1))
        x03 = self.conv03(torch.cat((x00, x01, x02, self.up10(x12)), 1))
        x13 = self.conv13(torch.cat((x10, x11, x12, self.up20(x22)), 1))
        x04 = self.conv04(torch.cat((x00, x01, x02, x03, self.up10(x13)), 1))
        return self.head(x04)

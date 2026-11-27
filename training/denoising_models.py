import torch
from torch import nn


class CadicaDenoiser(nn.Module):
    def __init__(self, channels=16):
        super().__init__()
        self.noise_estimator = nn.Sequential(
            nn.Conv2d(1, channels, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(channels, channels, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(channels, channels, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(channels, channels, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(channels, 1, 3, padding=1),
        )

    def forward(self, noisy):
        return (noisy - self.noise_estimator(noisy)).clamp(0.0, 1.0)

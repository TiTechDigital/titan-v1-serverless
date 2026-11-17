"""Minimal Real-ESRGAN x4plus runner (RRDBNet) with no basicsr/realesrgan dependency.

basicsr/realesrgan pull in opencv + a broken torchvision import on torch 2.4,
so the RRDBNet architecture is vendored here. State-dict keys match the
official RealESRGAN_x4plus.pth.

Weights source (first match wins):
  ESRGAN_HF_REPO + ESRGAN_HF_FILE  -> Hugging Face (uses HF_TOKEN)
  otherwise                        -> official GitHub release
"""
import os
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

GITHUB_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"


class ResidualDenseBlock(nn.Module):
    def __init__(self, num_feat=64, num_grow_ch=32):
        super().__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, num_feat, num_grow_ch=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32):
        super().__init__()
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(num_feat, num_grow_ch) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def _weights_path():
    repo = os.environ.get("ESRGAN_HF_REPO")
    if repo:
        from huggingface_hub import hf_hub_download
        return hf_hub_download(
            repo_id=repo,
            filename=os.environ.get("ESRGAN_HF_FILE", "RealESRGAN_x4plus.pth"),
            token=os.environ.get("HF_TOKEN"),
        )
    path = "/RealESRGAN_x4plus.pth"
    if not os.path.exists(path):
        torch.hub.download_url_to_file(GITHUB_URL, path)
    return path


class Upscaler:
    """x4 Real-ESRGAN, FP16, tiled to bound VRAM next to the LTX pipeline."""

    def __init__(self, device="cuda", tile=256, pad=10):
        net = RRDBNet()
        sd = torch.load(_weights_path(), map_location="cpu")
        sd = sd.get("params_ema", sd.get("params", sd))
        net.load_state_dict(sd, strict=True)
        self.net = net.eval().half().to(device)
        self.device, self.tile, self.pad = device, tile, pad

    @torch.inference_mode()
    def _run(self, x):
        _, _, h, w = x.shape
        t, p = self.tile, self.pad
        out = torch.zeros(1, 3, h * 4, w * 4, dtype=x.dtype, device=x.device)
        for y0 in range(0, h, t):
            for x0 in range(0, w, t):
                y1, x1 = min(y0 + t, h), min(x0 + t, w)
                ya, xa = max(y0 - p, 0), max(x0 - p, 0)
                yb, xb = min(y1 + p, h), min(x1 + p, w)
                tile_out = self.net(x[:, :, ya:yb, xa:xb])
                oy0, ox0 = (y0 - ya) * 4, (x0 - xa) * 4
                out[:, :, y0 * 4:y1 * 4, x0 * 4:x1 * 4] = tile_out[
                    :, :, oy0:oy0 + (y1 - y0) * 4, ox0:ox0 + (x1 - x0) * 4
                ]
        return out

    @torch.inference_mode()
    def enhance(self, img: Image.Image) -> Image.Image:
        arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
        x = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).half().to(self.device)
        y = self._run(x).clamp(0, 1)
        y = (y[0].permute(1, 2, 0).float().cpu().numpy() * 255.0).round().astype(np.uint8)
        return Image.fromarray(y)

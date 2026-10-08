"""上传照片规范化：按 EXIF 方向转正、HEIC 转 JPEG、拒绝非图片（review C-1、I-1）。"""
import io

import pytest
from PIL import Image

from facade_modeler.photos.measure import EXIF_IFD, FOCAL_35MM_TAG
from facade_modeler.photos.normalize import normalize_photo

ORIENTATION = 0x0112


def jpeg_with_orientation(orientation: int, size=(400, 300), focal_35=None) -> bytes:
    image = Image.new("RGB", size, (200, 100, 50))
    exif = Image.Exif()
    exif[ORIENTATION] = orientation
    if focal_35:
        exif.get_ifd(EXIF_IFD)[FOCAL_35MM_TAG] = focal_35
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif.tobytes())
    return buffer.getvalue()


def test_exif_rotated_jpeg_is_stored_upright():
    data = normalize_photo(jpeg_with_orientation(6))
    with Image.open(io.BytesIO(data)) as image:
        assert image.size == (300, 400)
        assert image.getexif().get(ORIENTATION, 1) == 1


def test_focal_length_survives_normalization():
    data = normalize_photo(jpeg_with_orientation(6, focal_35=26))
    with Image.open(io.BytesIO(data)) as image:
        assert image.getexif().get_ifd(EXIF_IFD).get(FOCAL_35MM_TAG) == 26


def test_heic_upload_is_converted():
    pillow_heif = pytest.importorskip("pillow_heif")
    buffer = io.BytesIO()
    pillow_heif.from_pillow(Image.new("RGB", (320, 240), (10, 120, 200))).save(buffer, quality=80)
    data = normalize_photo(buffer.getvalue())
    with Image.open(io.BytesIO(data)) as image:
        assert image.format == "JPEG" and image.size == (320, 240)


def test_non_image_rejected():
    with pytest.raises(ValueError):
        normalize_photo(b"%PDF-1.4 not an image")

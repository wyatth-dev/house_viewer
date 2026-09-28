#!/usr/bin/env python3
"""Normalize pinned PBR source maps into self-hosted web material packages.
Requires Python 3 + Pillow. Source downloads are cached outside public/.
"""
import argparse
import hashlib
import io
import zipfile
import json
from pathlib import Path
import re
import urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    spec = json.loads(args.source.read_text())
    material_id = spec['id']
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', material_id):
        raise ValueError('Material ID must be a lowercase slug')
    if spec['schemaVersion'] != 1 or spec['normalConvention'] != 'OpenGL':
        raise ValueError('Expected v1 manifest with OpenGL normal maps')
    if len(spec['tileMeters']) != 2 or any(not isinstance(v, (int, float)) or v <= 0 for v in spec['tileMeters']):
        raise ValueError('Specify the physical width and depth of one texture repeat')
    for field in ['provider', 'url', 'author', 'license', 'licenseUrl', 'retrievedAt']:
        if not spec['source'].get(field):
            raise ValueError('Missing source metadata: ' + field)
    cache = ROOT / '.material-cache' / material_id
    output = ROOT / 'public/materials' / material_id
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    if 'archive' in spec:
        archive = spec['archive']
        path = cache / 'source.zip'
        if not archive['url'].startswith('https://'):
            raise ValueError('Only HTTPS source archives are supported')
        if not path.exists() or digest(path.read_bytes()) != archive['sha256']:
            request = urllib.request.Request(archive['url'], headers={'User-Agent': 'HouseGroundMaterialImporter/1.0'})
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read()
            if digest(data) != archive['sha256']:
                raise ValueError('Source archive checksum changed')
            path.write_bytes(data)
        with zipfile.ZipFile(path) as bundle:
            def read_map(name):
                image = Image.open(io.BytesIO(bundle.read(name)))
                image.load()
                if image.mode not in ['RGB', 'RGBA', 'L']:
                    raise ValueError('Archive adapter requires 8-bit image maps')
                return image
            images = {role: read_map(spec['maps'][role]['entry']).convert('RGB') for role in ['baseColor', 'normal']}
            channels = [read_map(spec['maps']['orm'][role]).convert('L') for role in ['occlusion', 'roughness']]
            if channels[0].size != channels[1].size:
                raise ValueError('ORM source dimensions differ')
            metallic = spec['maps']['orm']['metallic']
            if not isinstance(metallic, int) or metallic < 0 or metallic > 255:
                raise ValueError('Expected constant metallic in [0,255]')
            images['orm'] = Image.merge('RGB', (*channels, Image.new('L', channels[0].size, metallic)))
    else:
        images = {}
        for role in ['baseColor', 'normal', 'orm']:
            source = spec['maps'][role]
            if not source['url'].startswith('https://'):
                raise ValueError('Only HTTPS source URLs are supported')
            path = cache / (role + '.png')
            if not path.exists() or digest(path.read_bytes()) != source['sha256']:
                request = urllib.request.Request(source['url'], headers={'User-Agent': 'HouseGroundMaterialImporter/1.0'})
                with urllib.request.urlopen(request, timeout=60) as response:
                    data = response.read()
                if digest(data) != source['sha256']:
                    raise ValueError('Source checksum changed: ' + role)
                path.write_bytes(data)
            image = Image.open(path)
            image.load()
            images[role] = image.convert('RGB')
    if len({image.size for image in images.values()}) != 1:
        raise ValueError('All maps must have matching dimensions and registration')
    manifest = {key: spec[key] for key in ['schemaVersion', 'id', 'label', 'source', 'tileMeters', 'normalConvention']}
    manifest['profiles'] = {}
    for profile, size in spec['profiles'].items():
        if profile not in ['1k', '2k'] or size != {'1k': 1024, '2k': 2048}[profile]:
            raise ValueError('Only explicit 1k/2k profiles are supported')
        maps = {}
        for role, image in images.items():
            if min(image.size) < size:
                raise ValueError('Upscaling source textures is not allowed')
            destination = output / profile / (role + '.webp')
            destination.parent.mkdir(parents=True, exist_ok=True)
            resized = image.resize((size, size), Image.Resampling.LANCZOS)
            # Keep data maps lossless; albedo can use high-quality lossy compression.
            resized.save(destination, 'WEBP', lossless=role != 'baseColor', quality=88, method=6)
            data = destination.read_bytes()
            maps[role] = {'file': f'{profile}/{role}.webp', 'width': size, 'height': size,
                          'colorSpace': 'srgb' if role == 'baseColor' else 'linear',
                          'bytes': len(data), 'sha256': digest(data)}
        manifest['profiles'][profile] = {'maps': maps, 'downloadBytes': sum(item['bytes'] for item in maps.values()),
                                        'estimatedGpuBytes': size * size * 4 * 3 * 4 // 3}
    (output / 'material.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Imported {material_id} from {spec["source"]["provider"]} ({spec["source"]["license"]})')
    for name, profile in manifest['profiles'].items():
        print(f'{name}: {profile["downloadBytes"] / 1048576:.2f} MiB download, approximately {profile["estimatedGpuBytes"] / 1048576:.0f} MiB GPU including mipmaps')


if __name__ == '__main__':
    main()

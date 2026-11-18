"""Derive platform icon sizes from the supplied artwork, without redrawing it."""
from pathlib import Path
from shutil import copyfile
import json
import argparse
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
masters = root / 'assets/branding/app-icons'
masters.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--admin', type=Path, default=masters / 'admin-original.png')
parser.add_argument('--professional', type=Path, default=masters / 'professional-original.png')
args = parser.parse_args()
sources = {'admin': args.admin, 'professional': args.professional}
res = root / 'android/app/src/main/res'
preview = Image.new('RGB', (640, 340), '#f7f8fa')
for index, (edition, source) in enumerate(sources.items()):
    master = masters / f'{edition}-original.png'
    if source.exists() and source.resolve() != master.resolve():
        copyfile(source, master)
    image = Image.open(master).convert('RGB')
    assert image.size == (500, 500)
    corners = [image.getpixel(point) for point in [(0, 0), (499, 0), (0, 499), (499, 499)]]
    background = tuple(round(sum(c[channel] for c in corners) / 4) for channel in range(3))
    for size in (192, 512):
        image.resize((size, size), Image.Resampling.LANCZOS).save(root / f'public/{edition}-icon-{size}.png')
    image.resize((180, 180), Image.Resampling.LANCZOS).save(root / f'public/{edition}-apple-touch-icon.png')
    maskable = Image.new('RGB', (512, 512), background)
    maskable.paste(image.resize((410, 410), Image.Resampling.LANCZOS), (51, 51))
    maskable.save(root / f'public/{edition}-icon-maskable-512.png')
    prefix = 'ic_launcher' if edition == 'admin' else 'professional_launcher'
    for density, scale in [('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)]:
        folder = res / f'mipmap-{density}'
        size = round(48 * scale)
        for suffix in ('', '_round'):
            image.resize((size, size), Image.Resampling.LANCZOS).save(folder / f'{prefix}{suffix}.png')
        # 108dp adaptive canvas, art inside 80dp: keep the full mark inside launcher masks.
        canvas = Image.new('RGBA', (round(108 * scale), round(108 * scale)), (0, 0, 0, 0))
        size = round(80 * scale)
        offset = (canvas.width - size) // 2
        canvas.paste(image.resize((size, size), Image.Resampling.LANCZOS), (offset, offset))
        canvas.save(folder / f'{prefix}_foreground.png')
    color_name = 'ic_launcher_background' if edition == 'admin' else 'professional_launcher_background'
    color = '#%02x%02x%02x' % background
    (res / f'values/{color_name}.xml').write_text(f'<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="{color_name}">{color}</color></resources>\n', encoding='utf8')
    for suffix in ('', '_round'):
        (res / f'mipmap-anydpi-v26/{prefix}{suffix}.xml').write_text(f'<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/{color_name}"/>\n    <foreground android:drawable="@mipmap/{prefix}_foreground"/>\n</adaptive-icon>\n', encoding='utf8')
    if edition == 'admin':
        image.resize((1024, 1024), Image.Resampling.LANCZOS).save(root / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
    else:
        image.resize((512, 512), Image.Resampling.LANCZOS).save(res / 'drawable/professional_icon.png')
    for manifest_name in (['admin', 'app'] if edition == 'admin' else ['professional']):
        path = root / f'public/{manifest_name}.webmanifest'
        manifest = json.loads(path.read_text(encoding='utf8'))
        manifest['icons'] = [
            {'src': f'/{edition}-icon-{size}.png', 'sizes': f'{size}x{size}', 'type': 'image/png', 'purpose': 'any'} for size in (192, 512)
        ] + [{'src': f'/{edition}-icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    preview.paste(image.resize((220, 220), Image.Resampling.LANCZOS), (50 + 320 * index, 12))
    foreground = Image.open(res / f'mipmap-xxxhdpi/{prefix}_foreground.png')
    native = Image.new('RGBA', foreground.size, background)
    native.alpha_composite(foreground)
    native = native.crop((72, 72, 360, 360)).resize((88, 88), Image.Resampling.LANCZOS)
    mask = Image.new('L', (88, 88), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 87, 87), fill=255)
    preview.paste(native.convert('RGB'), (116 + 320 * index, 244), mask)
output = root / '.private/screenshots/app-icons'
output.mkdir(parents=True, exist_ok=True)
preview.save(output / 'icons-preview.png')
print('Platform icons generated from the two original 500px PNG files.')

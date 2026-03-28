# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['VegaHubLauncher.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('icon.ico', '.'),
        ('icon.png', '.'),
        ('node.exe', '.'),
        ('package.json', '.'),
        ('server.bundle.js', '.'),
        ('build-bundled.js', '.'),
        ('manifest.json', '.'),
        ('artplayer.js', '.'),
        ('dist', 'dist'),
        ('web', 'web'),
        ('vlc_bundle', 'vlc_bundle')
    ],
    hiddenimports=['vlc', 'customtkinter', 'PIL', 'PIL._tkinter_setup', 'player_window'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='VegaHub',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)

# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all

def get_deps(hook_name):
    datas, binaries, hiddenimports = collect_all(hook_name)
    return datas, binaries, hiddenimports

# --- Main App Analysis ---
d1, b1, h1 = get_deps('customtkinter')
a = Analysis(
    ['peott.py'],
    pathex=[],
    binaries=b1,
    datas=d1 + [('ui', 'ui'), ('icon.ico', '.')],
    hiddenimports=h1 + ['webview.platforms.edgechromium', 'webview.platforms.winforms'],
    hookspath=[],
    hooksconfig={},
    excludes=['PyQt6', 'PyQt5.QtNetwork', 'PyQt5.QtQml', 'PyQt5.QtQuick'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

# --- Player Analysis ---
d2, b2, h2 = get_deps('PyQt5')
# Also add VLC if exists
import os
if os.path.exists('vlc_bundle'):
    d2.append(('vlc_bundle', 'vlc_bundle'))

a2 = Analysis(
    ['player_window.py'],
    pathex=[],
    binaries=b2,
    datas=d2,
    hiddenimports=h2 + ['player_window'],
    hookspath=[],
    hooksconfig={},
    excludes=['PyQt6', 'PyQt5.QtNetwork', 'PyQt5.QtQml', 'PyQt5.QtQuick'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)
pyz2 = PYZ(a2.pure, a2.zipped_data, cipher=None)

exe1 = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='OrbixPlay',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icon.ico',
)

exe2 = EXE(
    pyz2,
    a2.scripts,
    [],
    exclude_binaries=True,
    name='player',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icon.ico',
)

coll = COLLECT(
    exe1,
    a.binaries,
    a.zipfiles,
    a.datas,
    exe2,
    a2.binaries,
    a2.zipfiles,
    a2.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='OrbixPlay',
)

import struct
import zlib
import math

def create_png(width, height, draw_fn, filepath):
    # PNG signature
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    png += struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # Raw pixel scanlines
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0: None
        for x in range(width):
            r, g, b, a = draw_fn(x, y, width, height)
            raw_data.extend([r, g, b, a])
            
    # IDAT
    compressed = zlib.compress(bytes(raw_data), 9)
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND
    iend_crc = zlib.crc32(b'IEND')
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    
    with open(filepath, 'wb') as f:
        f.write(png)
    print(f"Generated {filepath} ({width}x{height})")

def icon_drawer(x, y, w, h):
    # Normalize coordinates to -1.0 to 1.0
    nx = (x / w) * 2.0 - 1.0
    ny = (y / h) * 2.0 - 1.0
    
    # Base background: Sage Green #EAF0EC
    bg_r, bg_g, bg_b = 234, 240, 236
    
    # Rounded outer corner mask
    # distance from center in squircle
    dist_sq = (nx**4 + ny**4)**0.25
    if dist_sq > 0.95:
        # Transparent outside squircle
        return (0, 0, 0, 0)
    
    # Raised circular emblem in center
    dist_center = math.sqrt(nx*nx + ny*ny)
    
    # Emerald green shield/hexagon in center
    # Primary #345C47 -> r=52, g=92, b=71
    if dist_center < 0.65:
        # Check shield shape
        # top boundary ny > -0.55
        # bottom point at (0, 0.6)
        shield_top = -0.52
        shield_bot = 0.58
        if ny >= shield_top and ny <= shield_bot:
            # width taper
            if ny < 0.1:
                cur_w = 0.50
            else:
                progress = (ny - 0.1) / (shield_bot - 0.1)
                cur_w = 0.50 * (1.0 - progress * 0.92)
            
            if abs(nx) <= cur_w:
                # Inside shield!
                # Checkmark inside shield: White
                # check points: left (-0.2, 0.05), mid (-0.05, 0.20), right (0.24, -0.15)
                # Let's check distance to line segments
                def dist_to_seg(px, py, x1, y1, x2, y2):
                    dx = x2 - x1
                    dy = y2 - y1
                    t = max(0.0, min(1.0, ((px - x1)*dx + (py - y1)*dy) / (dx*dx + dy*dy)))
                    closest_x = x1 + t * dx
                    closest_y = y1 + t * dy
                    return math.sqrt((px - closest_x)**2 + (py - closest_y)**2)
                
                d1 = dist_to_seg(nx, ny, -0.18, 0.08, -0.04, 0.22)
                d2 = dist_to_seg(nx, ny, -0.04, 0.22, 0.22, -0.12)
                d_check = min(d1, d2)
                
                if d_check < 0.06:
                    return (255, 255, 255, 255)
                
                # Small Gold coin in lower shield:
                coin_dist = math.sqrt((nx - 0.0)**2 + (ny - 0.38)**2)
                if coin_dist < 0.10:
                    return (212, 175, 55, 255)  # Gold
                
                # Inner subtle gradient
                light = 1.0 - (ny * 0.25)
                return (int(52 * light), int(92 * light), int(71 * light), 255)
    
    # Outside shield, inside squircle -> Neumorphic card body
    # Subtle lighting gradient
    light = 1.0 - (nx * 0.04 + ny * 0.04)
    r = min(255, int(bg_r * light))
    g = min(255, int(bg_g * light))
    b = min(255, int(bg_b * light))
    return (r, g, b, 255)

def maskable_drawer(x, y, w, h):
    # Maskable has full bleed background with safe zone in inner 75%
    nx = (x / w) * 2.0 - 1.0
    ny = (y / h) * 2.0 - 1.0
    
    bg_r, bg_g, bg_b = 234, 240, 236
    dist_center = math.sqrt(nx*nx + ny*ny)
    
    # Scale down emblem to fit 70% safe zone
    snx = nx / 0.75
    sny = ny / 0.75
    s_dist = math.sqrt(snx*snx + sny*sny)
    
    if s_dist < 0.65:
        shield_top = -0.52
        shield_bot = 0.58
        if sny >= shield_top and sny <= shield_bot:
            if sny < 0.1:
                cur_w = 0.50
            else:
                progress = (sny - 0.1) / (shield_bot - 0.1)
                cur_w = 0.50 * (1.0 - progress * 0.92)
            
            if abs(snx) <= cur_w:
                def dist_to_seg(px, py, x1, y1, x2, y2):
                    dx = x2 - x1
                    dy = y2 - y1
                    t = max(0.0, min(1.0, ((px - x1)*dx + (py - y1)*dy) / (dx*dx + dy*dy)))
                    closest_x = x1 + t * dx
                    closest_y = y1 + t * dy
                    return math.sqrt((px - closest_x)**2 + (py - closest_y)**2)
                
                d1 = dist_to_seg(snx, sny, -0.18, 0.08, -0.04, 0.22)
                d2 = dist_to_seg(snx, sny, -0.04, 0.22, 0.22, -0.12)
                if min(d1, d2) < 0.06:
                    return (255, 255, 255, 255)
                
                coin_dist = math.sqrt((snx - 0.0)**2 + (sny - 0.38)**2)
                if coin_dist < 0.10:
                    return (212, 175, 55, 255)
                
                light = 1.0 - (sny * 0.25)
                return (int(52 * light), int(92 * light), int(71 * light), 255)
    
    # Full bleed background
    return (bg_r, bg_g, bg_b, 255)

if __name__ == '__main__':
    create_png(192, 192, icon_drawer, 'public/pwa-192x192.png')
    create_png(512, 512, icon_drawer, 'public/pwa-512x512.png')
    create_png(180, 180, icon_drawer, 'public/apple-touch-icon.png')
    create_png(512, 512, maskable_drawer, 'public/pwa-maskable-512x512.png')
    print("All PWA icons generated successfully!")

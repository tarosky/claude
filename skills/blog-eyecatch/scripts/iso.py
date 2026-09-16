#!/usr/bin/env python3
"""
アイソメトリック(等角投影)のSVGを組み立てる小さなライブラリ。

「Claudeはアイソメトリックなイラストを描けない」と思われがちだが、等角投影は
センスではなく座標変換なので、むしろSVGの方が画像生成AIより正確に出せる
(線幅・配色が必ず揃い、あとから寸法を変えられる)。

投影(平行投影・軸測投影):
    sx = ( x*sinθ - y*cosθ ) * √1.5
    sy = ( (x*cosθ + y*sinθ)*sinφ - z*cosφ ) * √1.5
  θ=方位角(カメラの水平方向)、φ=仰角(カメラの高さ)。
  θ=45°, φ=35.264° が正等角投影(いわゆるアイソメトリック)で、これが既定値。

  **θを45°からずらすと左右非対称になり、「左斜め上から見下ろす」構図になる。**
  φを上げるほど真上に近づく。x は右奥、y は左奥、z は上。
  θ∈(0°,90°), φ∈(0°,90°) の範囲なら「上面」「xが最大の面(右)」「yが最大の面(左)」の
  3面が見える、という box() の前提は崩れない。

覚えておくと便利な性質:
  - 地面(XY平面)に置いた半径 r の円は、必ず横長の楕円(rx = √1.5*r, ry = r/√2)になる。
    手描きで楕円の比率を間違えると一気に嘘くさくなるので、必ず projectしたパスで描く。
  - 立方体の上面は正菱形になる。

使い方:
    from iso import Scene
    s = Scene(scale=18)
    s.box((-6, -6, 0), (12, 12, 1.4), top="#FFFFFF", left="#F7ECE9", right="#DDDDDD")
    print(s.to_svg(width=520))
"""
import math

COS30 = math.cos(math.radians(30))

# 既定の視点。正等角投影(アイソメトリック)。
ISO_AZIMUTH = 45.0
ISO_ELEVATION = math.degrees(math.atan(1 / math.sqrt(2)))  # 35.264°
NORM = math.sqrt(1.5)  # 既定角で sx=(x-y)*cos30, sy=(x+y)/2-z になるよう正規化

# Maintic のイラスト配色(references/brand-guideline.md)
INK = "#242424"
RED = "#A60C30"
RED_BRIGHT = "#C2042D"
GRAY = "#DDDDDD"
PALE = "#F7ECE9"
WHITE = "#FFFFFF"


def project(x, y, z, scale=1.0, azimuth=ISO_AZIMUTH, elevation=ISO_ELEVATION):
    """3D座標を画面座標へ。既定はアイソメトリック。"""
    th, ph = math.radians(azimuth), math.radians(elevation)
    sx = (x * math.sin(th) - y * math.cos(th)) * NORM * scale
    sy = ((x * math.cos(th) + y * math.sin(th)) * math.sin(ph)
          - z * math.cos(ph)) * NORM * scale
    return sx, sy


def circle_points(cx, cy, r, n=64):
    """XY平面上の円を、頂点列として返す(projectすると横長の楕円になる)。"""
    return [
        (cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n))
        for i in range(n)
    ]


def arc_points(cx, cy, r, start_deg, end_deg, n=32):
    """XY平面上の円弧の頂点列。"""
    a0, a1 = math.radians(start_deg), math.radians(end_deg)
    return [
        (cx + r * math.cos(a0 + (a1 - a0) * i / (n - 1)),
         cy + r * math.sin(a0 + (a1 - a0) * i / (n - 1)))
        for i in range(n)
    ]


class Scene:
    """描いた順に手前へ重なる。奥のものから追加すること。"""

    def __init__(self, scale=18, stroke=INK, stroke_width=6,
                 azimuth=ISO_AZIMUTH, elevation=ISO_ELEVATION):
        self.scale = scale
        self.azimuth = azimuth
        self.elevation = elevation
        self.stroke = stroke
        self.stroke_width = stroke_width
        self.parts = []   # (svg断片, [画面座標の点...])

    # --- 低レベル ---------------------------------------------------------
    def at(self, x, y, z):
        return project(x, y, z, self.scale, self.azimuth, self.elevation)

    def _path(self, screen_pts, fill, close=True, stroke=None, width=None, extra=""):
        d = "M " + " L ".join(f"{px:.2f} {py:.2f}" for px, py in screen_pts)
        if close:
            d += " Z"
        st = self.stroke if stroke is None else stroke
        sw = self.stroke_width if width is None else width
        markup = f'<path d="{d}" fill="{fill}" stroke="{st}" stroke-width="{sw}"{extra}/>'
        self.parts.append((markup, screen_pts))
        return markup

    def raw(self, markup, screen_pts=()):
        """画面座標で直接描く(人物など、立体にしない要素用)。"""
        self.parts.append((markup, list(screen_pts)))

    # --- 3Dプリミティブ ---------------------------------------------------
    def poly3(self, pts3, fill, **kw):
        """3D頂点列を面として描く。"""
        return self._path([self.at(*p) for p in pts3], fill, **kw)

    def poly2(self, pts2, z, fill, **kw):
        """XY平面(高さz)上の2D頂点列を面として描く。"""
        return self.poly3([(x, y, z) for x, y in pts2], fill, **kw)

    def box(self, origin, size, top=WHITE, left=PALE, right=GRAY):
        """直方体。見える3面(上・左・右)だけを描く。"""
        x0, y0, z0 = origin
        w, d, h = size
        x1, y1, z1 = x0 + w, y0 + d, z0 + h
        # 奥から: 上面 -> 左面 -> 右面 の順で問題ない(交差しないため)
        self.poly3([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], top)
        self.poly3([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], left)
        self.poly3([(x1, y0, z1), (x1, y1, z1), (x1, y1, z0), (x1, y0, z0)], right)

    def slab_with_face(self, origin, size, face_color, **kw):
        """上面だけ色を変えた直方体(階層の最上段を赤くする等)。"""
        self.box(origin, size, top=face_color, **kw)

    # --- 出力 -------------------------------------------------------------
    def bbox(self):
        xs = [p[0] for _, pts in self.parts for p in pts]
        ys = [p[1] for _, pts in self.parts for p in pts]
        return min(xs), min(ys), max(xs), max(ys)

    def to_svg(self, width=None, pad=None, comment=None):
        pad = self.stroke_width * 2 if pad is None else pad
        x0, y0, x1, y1 = self.bbox()
        x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
        vw, vh = x1 - x0, y1 - y0
        attrs = f'viewBox="{x0:.2f} {y0:.2f} {vw:.2f} {vh:.2f}"'
        if width:
            attrs = f'width="{width}" height="{width * vh / vw:.2f}" ' + attrs
        head = f"<!-- {comment} -->\n" if comment else ""
        body = "\n  ".join(markup for markup, _ in self.parts)
        return (
            f'{head}<svg {attrs} xmlns="http://www.w3.org/2000/svg">\n'
            f'  <g stroke-linejoin="round" stroke-linecap="round">\n  {body}\n  </g>\n</svg>\n'
        )

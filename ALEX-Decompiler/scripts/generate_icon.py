"""Original teal-violet decompiler icon, separate from ALEX Executor's purple A."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'build';OUT.mkdir(exist_ok=True)
n=1024
base=Image.new('RGBA',(n,n),(0,0,0,0))
bg=Image.new('RGBA',(n,n),(0,0,0,0));draw=ImageDraw.Draw(bg)
draw.rounded_rectangle((28,28,995,995),radius=220,fill=(17,16,39,255))
for i in range(150):
  t=i/150
  a=int(110*(1-t)**2)
  draw.ellipse((520-i*5,400-i*5,520+i*5,400+i*5),outline=(93,58,207,a),width=4)
base.alpha_composite(bg)
glow=Image.new('RGBA',(n,n),(0,0,0,0));g=ImageDraw.Draw(glow)
g.rounded_rectangle((208,212,819,821),radius=145,fill=(76,230,241,170))
glow=glow.filter(ImageFilter.GaussianBlur(76));base.alpha_composite(glow)
d=ImageDraw.Draw(base)
d.rounded_rectangle((104,104,920,920),radius=168,fill=(23,27,63,246),outline=(99,105,207,180),width=10)
d.rounded_rectangle((177,178,848,848),radius=130,fill=(29,25,66,255),outline=(112,74,210,255),width=16)
# High contrast locked script panel motif: bracket pair and crystalline D
c=(141,228,247,255);v=(190,133,255,255)
d.line([(391,355),(310,460),(391,564)],fill=c,width=49,joint='curve')
d.line([(633,355),(714,460),(633,564)],fill=c,width=49,joint='curve')
d.line([(565,313),(461,619)],fill=v,width=35)
d.rounded_rectangle((395,696,629,735),radius=19,fill=(176,124,255,255))
d.ellipse((468,673,552,757),fill=(53,236,211,255))
d.ellipse((488,694,532,737),fill=(23,27,63,255))
base.save(OUT/'icon.png',optimize=True)
base.save(OUT/'icon.icns')
base.save(OUT/'icon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
for p in ('icon.png','icon.icns','icon.ico'):
  assert (OUT/p).stat().st_size>1000
  print('Created',p,(OUT/p).stat().st_size)

#!/usr/bin/env python3
"""js/css/template을 단일 HTML로 인라인 조립. 표준 라이브러리만 사용."""
from pathlib import Path

ROOT = Path(__file__).parent
def read(p): return (ROOT / p).read_text(encoding="utf-8")

template = read("html/template.html")
repl = {
    "/*__CSS__*/": read("css/rsd.css"),
    # 3D 뷰용 벤더 라이브러리 (three.js r128 MIT). 사내망·오프라인 동작을 위해 인라인한다.
    "/*__THREE__*/": read("js/vendor/three.min.js"),
    "/*__ORBIT__*/": read("js/vendor/OrbitControls.js"),
    "/*__CORE__*/": read("js/rsd-core.js"),
    "/*__MATH__*/": read("js/rsd-math.js"),
    "/*__DATA__*/": read("js/rsd-data.js"),
    "/*__ENGINE_YARD__*/": read("js/rsd-engine-yard.js"),
    "/*__ENGINE_SHED__*/": read("js/rsd-engine-shed.js"),
    "/*__ENGINE_SILO__*/": read("js/rsd-engine-silo.js"),
    "/*__ENGINE_MASTER__*/": read("js/rsd-engine-master.js"),
    "/*__DRAW2D__*/": read("js/rsd-draw2d.js"),
    "/*__BANDS__*/": read("js/rsd-bands.js"),
    "/*__EQUIP__*/": read("js/rsd-equip.js"),
    "/*__EQUIP3D__*/": read("js/rsd-equip3d.js"),
    "/*__DRAW3D__*/": read("js/rsd-draw3d.js"),
    "/*__CONTROLS__*/": read("js/rsd-ui-controls.js"),
    "/*__DRAW2D_HELP__*/": read("js/rsd-draw2d-help.js"),
    "/*__DRAW2D_SHED__*/": read("js/rsd-draw2d-shed.js"),
    "/*__DRAW2D_SILO__*/": read("js/rsd-draw2d-silo.js"),
    "/*__DRAW2D_MASTER__*/": read("js/rsd-draw2d-master.js"),
    "/*__UI_YARD__*/": read("js/rsd-ui-yard.js"),
    "/*__UI_COMPARE__*/": read("js/rsd-ui-compare.js"),
    "/*__UI_FACILITY__*/": read("js/rsd-ui-facility.js"),
    "/*__EXPORT__*/": read("js/rsd-export.js"),
    "/*__SENSITIVITY__*/": read("js/rsd-ui-sensitivity.js"),
    "/*__UI__*/": read("js/rsd-ui.js"),
    "/*__APP__*/": read("js/rsd-app.js"),
}
out = template
for token, content in repl.items():
    assert token in out, f"플레이스홀더 누락: {token}"
    out = out.replace(token, content)

(ROOT / "원료저장설비-면적계산.html").write_text(out, encoding="utf-8")
print("OK: 원료저장설비-면적계산.html 생성 (%d bytes)" % len(out))

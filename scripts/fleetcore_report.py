"""
FleetCore Monthly Operations Report Generator
Run: python fleetcore_report.py
Output: fleetcore_report_march2026.pdf
"""

import io
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer,
    Table, TableStyle, HRFlowable, Image, PageBreak, KeepTogether
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfgen import canvas as pdfcanvas

# ---------------------------------------------------------------------------
# DESIGN SYSTEM
# ---------------------------------------------------------------------------
INK      = "#0D1B2A"
NAVY     = "#1B2B4B"
STEEL    = "#2C4A7C"
ACCENT   = "#1D6FE8"
SKY      = "#38BDF8"
GREEN    = "#10B981"
AMBER    = "#F59E0B"
RED      = "#EF4444"
PURPLE   = "#8B5CF6"
TEAL     = "#14B8A6"
WHITE    = "#FFFFFF"
OFFWHITE = "#F9FAFB"
LGRAY    = "#F1F5F9"
MGRAY    = "#CBD5E1"
DGRAY    = "#64748B"
TEXT     = "#1E293B"
MUTED    = "#94A3B8"

def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16)/255 for i in (0, 2, 4))

def rl_color(h):
    r, g, b = hex2rgb(h)
    return colors.Color(r, g, b)

CLIENT_COLORS = [ACCENT, STEEL, TEAL, GREEN, AMBER, PURPLE,
                 SKY, "#F97316", "#EC4899", DGRAY, "#6366F1", MUTED, "#84CC16"]

# ---------------------------------------------------------------------------
# PAGE SETUP
# ---------------------------------------------------------------------------
PW, PH = A4
LM = RM = 16 * mm
TM = BM = 16 * mm
W  = PW - LM - RM
HEADER_H = 18 * mm
FOOTER_H = 10 * mm

PERIOD = "March 2026"
COMPANY = "ALR Transport (Pty) Ltd"
DOMAIN = "fleetcore.app"

# ---------------------------------------------------------------------------
# DATA
# ---------------------------------------------------------------------------
KPI_REVENUE    = 1390041
KPI_KM         = 25582
KPI_ROUTES     = 102
KPI_COMPLETED  = 95
KPI_RATE       = 54.34

CLIENTS = [
    ("SHAVECO",               370589, 2, 49.57),
    ("GEO PARKES",            196292, 2, 63.94),
    ("POLEYARD",              130922, 2, 35.89),
    ("GEELHOUTVLEI",          121348, 2, 92.63),
    ("GOLDEN HARVEST",         95519, 2, 58.10),
    ("MTO FORESTRY",           92280, 2, 44.39),
    ("ALIEN TREE SOLUTIONS",   55735, 2, 51.85),
    ("UNIVERSAL LEAF",         36919, 2,  0.00),
    ("AHRHOF FUTTERGUT",       36000, 2,  0.00),
    ("THE SUNSHADERS",         31148, 2, 21.05),
    ("RICHARD KANE",           21696, 2,  0.00),
    ("TIMBER TWO PROCESSES",   20246, 2, 29.77),
    ("SUB SAHARA SOLAR",       18500, 2, 29.79),
]

DRIVERS_ALL = [
    ("Vusumzi Khahlula",   63691, 1349),
    ("Jackson Madikane",   56658,  790),
    ("Tony Beukes",        53013,  926),
    ("Zuko Daykopu",       51946,  680),
    ("Alfie Gqomfa",       48780,  450),
    ("Jabulani Mlambo",    46104,    0),
    ("John Oelf",          44664,  918),
    ("Zakaria Nkanyane",   44342,  450),
    ("Warren Groener",     43864,  340),
    ("Yandisa Cetywayo",   41674,  690),
    ("Nkosi Dlamini",      41666, 1179),
    ("Phetho Nooi",        41266,  120),
    ("Petros Sizani",      40363,  355),
    ("Rufus Manyonya",     40097,  448),
    ("Seithati Nooi",      36919,  570),
    ("Thabang Matlakala",  34702, 1300),
    ("Josias Marokane",    34500,    0),
    ("Bethuel Mathe",      33305,    0),
    ("Themba Mkhluli",     32750, 1644),
    ("Thulani Malevu",     31148, 1480),
    ("Dumisani Tshuma",    30094,  377),
    ("Patrick Blandile",   30000,    0),
    ("Tumelo Nketu",       28984,  477),
    ("Leaboka Nooi",       26339,  840),
    ("Atlehang Nketu",     25908,  790),
    ("Malusi Nyamana",     25898,  450),
    ("William Mgqalanga",  25551,  900),
    ("Ceadam Zwakala",     25513,  450),
    ("June Nsibonyani",    23774,  740),
    ("Sfiso Mazeka",       23685,  767),
    ("Litha Lamuni",       23024,    0),
    ("Isaac Mkhize",       21153,    0),
    ("Nathi Mthembu",      20978,  570),
    ("Nizibone Sokupa",    20246,  680),
    ("Petrus Zimu",        19399,  570),
    ("Innocent Nkosi",     18928,  496),
    ("Kelvin Mkhize",      18500,  621),
    ("Abraham Jason",      16259,  360),
    ("Lucky Nkosi",        16200,  545),
    ("Pheletso Seqoko",    14634,  570),
    ("Cyril Dzanibe",      13943,  340),
    ("Isaac Nchodu",       13666,    0),
    ("Cyprian Shelembe",   12929,  450),
    ("Monde Mpofu",        11701,    0),
    ("Big Boy Malapane",   11280,  450),
    ("Lawrence Setletse",  10004,  450),
    ("Bheka Ngema",            0,    0),
]

ROUTES = [
    ("02 Mar","112","William Mgqalanga",  "SEMPER PRIMA",    "George","Franschoek",       450, 13000,  28.89),
    ("02 Mar","135","Zakaria Nkanyane",   "SHAVECO",         "George","Hermanus",          450, 13421,  29.82),
    ("02 Mar","138","Yandisa Cetywayo",   "SHAVECO",         "George","Kaap",              450, 13666,  30.37),
    ("02 Mar","150","Abraham Jason",      "CERAMIC TILE MKT","George","George",             20,  2700, 135.00),
    ("03 Mar","136","Rufus Manyonya",     "SHAVECO",         "George","Pretoria",            0, 28498,   0.00),
    ("03 Mar","143","Dumisani Tshuma",    "GEO PARKES",      "Knysna","Port Elizabeth",   350, 12928,  36.94),
    ("03 Mar","144","Lawrence Setletse",  "POLEYARD",        "Riversdal","Helderberg",    450, 10004,  22.23),
    ("03 Mar","157","Warren Groener",     "SHAVECO",         "George","Hermanus",            0, 13421,   0.00),
    ("03 Mar","69", "Sfiso Mazeka",       "MTO FORESTRY",    "George","Kaap",             450, 11185,  24.86),
    ("04 Mar","107","Alfie Gqomfa",       "AHRHOF FUTTERGUT","George","Ogies/Bethal",       0, 36000,   0.00),
    ("04 Mar","132","Ceadam Zwakala",     "GEO PARKES",      "Knysna","Port Elizabeth",     0, 13164,   0.00),
    ("04 Mar","146","Bethuel Mathe",      "SHAVECO",         "George","Vredendal",          0, 21604,   0.00),
    ("04 Mar","158","Nkosi Dlamini",      "SHAVECO",         "George","Kaap",               0, 13666,   0.00),
    ("04 Mar","87", "John Oelf",          "GEELHOUTVLEI",    "Karatara","Kaap",             0, 14958,   0.00),
    ("09 Mar","111","Jackson Madikane",   "SHAVECO",         "George","Kaap",             450, 12551,  27.89),
    ("09 Mar","112","William Mgqalanga",  "SHAVECO",         "George","Stanford",         450, 12551,  27.89),
    ("10 Mar","101","Seithati Nooi",      "UNIVERSAL LEAF",  "Oudtshoorn","Johannesburg",   0, 36919,   0.00),
    ("10 Mar","109","Tony Beukes",        "RICHARD KANE",    "George","Kaap",               0, 21696,   0.00),
    ("10 Mar","122","Zuko Daykopu",       "GEO PARKES",      "Knysna","Port Elizabeth",     0, 13164,   0.00),
    ("12 Mar","113","Litha Lamuni",       "GEELHOUTVLEI",    "Karatara","Vredenburg",       0, 23024,   0.00),
    ("12 Mar","126","Cyprian Shelembe",   "SHAVECO",         "George","Kaap",             450, 12929,  28.73),
    ("13 Mar","107","Alfie Gqomfa",       "POLEYARD",        "Riversdal","Waca",          450, 12780,  28.40),
    ("14 Mar","122","Zuko Daykopu",       "GEO PARKES",      "Knysna","Port Elizabeth",   340, 13559,  39.88),
    ("14 Mar","165","Leaboka Nooi",       "GEO PARKES",      "Knysna","Port Elizabeth",   340, 13559,  39.88),
    ("14 Mar","87", "John Oelf",          "SHAVECO",         "George","Kaap",             448, 12929,  28.86),
    ("15 Mar","151","Patrick Blandile",   "GEELHOUTVLEI",    "Karatara","Humansdorp",       0, 30000,   0.00),
    ("16 Mar","124","Pheletso Seqoko",    "GEELHOUTVLEI",    "Karatara","Strand",         570, 14634,  25.67),
    ("16 Mar","145","Sfiso Mazeka",       "KBM SERVICES",    "George","Thornhill",        317, 12500,  39.43),
    ("16 Mar","149","Jabulani Mlambo",    "GOLDEN HARVEST",  "Mosselbaai","Witrivier",      0, 31848,   0.00),
    ("16 Mar","154","Vusumzi Khahlula",   "SHAVECO",         "George","Kaap",             450, 14078,  31.28),
    ("17 Mar","134","Abraham Jason",      "GEO PARKES",      "Hoekwil","Port Elizabeth",  340, 13559,  39.88),
    ("17 Mar","158","Atlehang Nketu",     "GEO PARKES",      "Knysna","Port Elizabeth",   340, 13559,  39.88),
    ("19 Mar","109","Tony Beukes",        "SHAVECO",         "George","Kaap/Robertson",   449, 14539,  32.38),
    ("19 Mar","111","Jackson Madikane",   "ICON CONSTRUCTION","George","Grahamstown",       0, 17000,   0.00),
    ("19 Mar","115","Thabang Matlakala",  "ALIEN TREE SOL.", "Louvain","George",          120,  6899,  57.49),
    ("19 Mar","148","Nkosi Dlamini",      "MTO FORESTRY",    "George","Pretoria",        1179, 28000,  23.75),
    ("20 Mar","120","Big Boy Malapane",   "POLEYARD",        "Riversdal","Capricorn",     450, 11280,  25.07),
    ("23 Mar","123","Nizibone Sokupa",    "TIMBER TWO",      "Hakerwille","Cape Town",    680, 20246,  29.77),
    ("23 Mar","154","Vusumzi Khahlula",   "SHAVECO",         "George","Kaap",             450, 14078,  31.28),
    ("23 Mar","165","Leaboka Nooi",       "POLEYARD",        "Riversdal","Paarden Eiland",500, 12780,  25.56),
    ("24 Mar","115","Thabang Matlakala",  "SHAVECO",         "George","Johannesburg",    1180, 27803,  23.56),
    ("24 Mar","125","Thulani Malevu",     "THE SUNSHADERS",  "Stillbaai","Johannesburg", 1480, 31148,  21.05),
    ("25 Mar","56", "Kelvin Mkhize",      "SUB SAHARA SOLAR","George","Piketberg",        621, 18500,  29.79),
    ("26 Mar","117","June Nsibonyani",    "GEELHOUTVLEI",    "George","Riversdal",        740, 23774,  32.13),
    ("27 Mar","119","Petros Sizani",      "ALIEN TREE SOL.", "Louvain","St Albens",       355, 14336,  40.38),
    ("27 Mar","122","Zuko Daykopu",       "GEO PARKES",      "Knysna","Port Elizabeth",   340, 13943,  41.01),
    ("27 Mar","169","Cyril Dzanibe",      "GEO PARKES",      "Knysna","Port Elizabeth",   340, 13943,  41.01),
    ("30 Mar","109","Tony Beukes",        "SHAVECO",         "George","Stellenbosch",     450, 14078,  31.28),
    ("30 Mar","132","Ceadam Zwakala",     "POLEYARD",        "Riversdal","Waca",          450, 12349,  27.44),
    ("30 Mar","141","Themba Mkhluli",     "GOLDEN HARVEST",  "Mosselbaai","Witrivier",   1644, 32750,  19.92),
    ("31 Mar","111","Jackson Madikane",   "GEO PARKES",      "Knysna","Port Elizabeth",   340, 13943,  41.01),
    ("31 Mar","157","Warren Groener",     "GEO PARKES",      "Hoekwil","Port Elizabeth",  340, 13943,  41.01),
    ("31 Mar","89", "Tumelo Nketu",       "POLEYARD",        "Riversdal","Helderberg",    450, 13099,  29.11),
]

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def fmt_currency(v):
    return f"R{v:,.0f}"

def fmt_rate(v):
    return f"R{v:.2f}/km"

def fig_to_image(fig, width=None, height=None):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=200, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    img = Image(buf)
    if width:
        ratio = img.imageHeight / img.imageWidth
        img.drawWidth = width
        img.drawHeight = width * ratio
    if height and not width:
        ratio = img.imageWidth / img.imageHeight
        img.drawHeight = height
        img.drawWidth = height * ratio
    return img

def std_spine(ax):
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color(MGRAY)
    ax.spines['left'].set_color(MGRAY)
    ax.tick_params(colors=DGRAY)

# ---------------------------------------------------------------------------
# CANVAS SUBCLASS (header + footer chrome)
# ---------------------------------------------------------------------------
class FleetcoreCanvas(pdfcanvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._page_num = 0

    def showPage(self):
        self._page_num += 1
        self._draw_chrome()
        super().showPage()

    def save(self):
        self._page_num += 1
        self._draw_chrome()
        super().save()

    def _draw_chrome(self):
        self.saveState()
        # --- HEADER ---
        self.setFillColor(rl_color(NAVY))
        self.rect(0, PH - HEADER_H, PW, HEADER_H, fill=1, stroke=0)
        # Accent stripe
        self.setFillColor(rl_color(ACCENT))
        self.rect(0, PH - HEADER_H, 3.5, HEADER_H, fill=1, stroke=0)
        # Wordmark
        self.setFont("Helvetica-Bold", 13)
        self.setFillColor(rl_color(WHITE))
        self.drawString(LM + 6, PH - 11.5 * mm, "FLEETCORE")
        # Subtitle
        self.setFont("Helvetica", 8)
        self.setFillColor(rl_color(SKY))
        wm_w = self.stringWidth("FLEETCORE", "Helvetica-Bold", 13)
        self.drawString(LM + 6 + wm_w + 8, PH - 11.5 * mm, "Monthly Operations Report")
        # Top-right info
        self.setFont("Helvetica", 7.5)
        self.setFillColor(rl_color(MUTED))
        right_text = f"{PERIOD}    Page {self._page_num}"
        rw = self.stringWidth(right_text, "Helvetica", 7.5)
        self.drawString(PW - RM - rw, PH - 11.5 * mm, right_text)
        # Bottom accent rule on header
        self.setStrokeColor(rl_color(ACCENT))
        self.setLineWidth(0.8)
        self.line(0, PH - HEADER_H, PW, PH - HEADER_H)
        # --- FOOTER ---
        self.setFillColor(rl_color(LGRAY))
        self.rect(0, 0, PW, FOOTER_H, fill=1, stroke=0)
        self.setFont("Helvetica", 7)
        self.setFillColor(rl_color(MUTED))
        self.drawString(LM, 3.5 * mm, f"{COMPANY}  •  Confidential — For Internal Use Only")
        dr = self.stringWidth(DOMAIN, "Helvetica", 7)
        self.drawString(PW - RM - dr, 3.5 * mm, DOMAIN)
        self.restoreState()

# ---------------------------------------------------------------------------
# PARAGRAPH STYLES
# ---------------------------------------------------------------------------
def make_styles():
    s = {}
    s['section_label'] = ParagraphStyle(
        'section_label',
        fontName='Helvetica-Bold',
        fontSize=7.5,
        textColor=rl_color(MUTED),
        spaceBefore=12,
        spaceAfter=4,
        leading=10,
    )
    s['title'] = ParagraphStyle(
        'title',
        fontName='Helvetica-Bold',
        fontSize=18,
        textColor=rl_color(INK),
        spaceAfter=4,
        leading=22,
    )
    s['subtitle'] = ParagraphStyle(
        'subtitle',
        fontName='Helvetica',
        fontSize=9,
        textColor=rl_color(DGRAY),
        spaceAfter=10,
        leading=13,
    )
    s['body'] = ParagraphStyle(
        'body',
        fontName='Helvetica',
        fontSize=9.5,
        textColor=rl_color(TEXT),
        leading=15,
    )
    s['insight'] = ParagraphStyle(
        'insight',
        fontName='Helvetica',
        fontSize=9.5,
        textColor=rl_color(TEXT),
        leading=15,
    )
    s['kpi_value'] = ParagraphStyle(
        'kpi_value',
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
    )
    s['kpi_label'] = ParagraphStyle(
        'kpi_label',
        fontName='Helvetica-Bold',
        fontSize=8,
        textColor=rl_color(TEXT),
        leading=11,
    )
    s['kpi_sub'] = ParagraphStyle(
        'kpi_sub',
        fontName='Helvetica',
        fontSize=7.5,
        textColor=rl_color(DGRAY),
        leading=10,
    )
    s['cover_period'] = ParagraphStyle(
        'cover_period',
        fontName='Helvetica',
        fontSize=9,
        textColor=rl_color(DGRAY),
        spaceAfter=8,
        leading=12,
    )
    s['cover_title'] = ParagraphStyle(
        'cover_title',
        fontName='Helvetica-Bold',
        fontSize=30,
        textColor=rl_color(INK),
        leading=34,
        spaceAfter=4,
    )
    s['cover_sub'] = ParagraphStyle(
        'cover_sub',
        fontName='Helvetica',
        fontSize=11,
        textColor=rl_color(DGRAY),
        spaceAfter=16,
        leading=15,
    )
    return s

# ---------------------------------------------------------------------------
# SECTION LABEL HELPER
# ---------------------------------------------------------------------------
def section_label(text, styles):
    return [
        Paragraph(text.upper(), styles['section_label']),
        HRFlowable(width="100%", thickness=0.4, color=rl_color(MGRAY), spaceAfter=6),
    ]

# ---------------------------------------------------------------------------
# KPI CARD TABLE (Page 1)
# ---------------------------------------------------------------------------
def build_kpi_cards(styles):
    cards = [
        (fmt_currency(KPI_REVENUE), "Total Revenue",   PERIOD,                    ACCENT),
        (f"{KPI_KM:,} km",          "Total Distance",  f"{KPI_ROUTES} routes dispatched", TEAL),
        ("93%",                     "Completion Rate", f"{KPI_COMPLETED} of {KPI_ROUTES} completed", GREEN),
        (f"R{KPI_RATE:.2f}/km",     "Fleet Avg Rate",  "Blended all clients",      PURPLE),
    ]

    cell_data = []
    for val, label, sub, color in cards:
        cell = [
            Paragraph(f'<font color="{color}"><b>{val}</b></font>', styles['kpi_value']),
            Paragraph(label, styles['kpi_label']),
            Paragraph(sub, styles['kpi_sub']),
        ]
        cell_data.append(cell)

    col_w = W / 4
    tbl = Table([cell_data], colWidths=[col_w] * 4)

    ts = TableStyle([
        ('BACKGROUND',   (0, 0), (-1, -1), rl_color(OFFWHITE)),
        ('BOX',          (0, 0), (-1, -1), 0.4, rl_color(MGRAY)),
        ('INNERGRID',    (0, 0), (-1, -1), 0.4, rl_color(MGRAY)),
        ('TOPPADDING',   (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 12),
        ('LEFTPADDING',  (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
    ])
    for i, (_, _, _, color) in enumerate(cards):
        ts.add('LINEABOVE', (i, 0), (i, 0), 2.5, rl_color(color))
    tbl.setStyle(ts)
    return tbl

# ---------------------------------------------------------------------------
# EXECUTIVE INSIGHT BOX (Page 1)
# ---------------------------------------------------------------------------
def build_insight_box(styles):
    insight_text = (
        'FleetCore completed <b>95 of 102 dispatched routes</b> in March 2026, achieving a '
        '<b>93% completion rate</b> and generating total revenue of <b>R1 390 041</b> across '
        '<b>25 582 km</b> of operations. <b>SHAVECO</b> remained the dominant client at '
        'R370 589 (27% of revenue), with <b>GEO PARKES</b> and <b>POLEYARD</b> rounding out '
        'the top three. Fleet rate averaged <b>R54.34/km</b>. Top earner for the month was '
        '<b>Vusumzi Khahlula</b> at R63 691. <b>GEELHOUTVLEI</b> delivered the highest rate '
        'per km at R92.63 — nearly double the fleet average — indicating strong load premiums '
        'on short-haul timber runs.'
    )
    box_data = [[
        Paragraph('<b>Executive Summary</b><br/><br/>' + insight_text, styles['insight'])
    ]]
    tbl = Table(box_data, colWidths=[W])
    tbl.setStyle(TableStyle([
        ('BACKGROUND',  (0, 0), (-1, -1), rl_color("#EFF6FF")),
        ('LINEABOVE',   (0, 0), (-1, 0),  2.0, rl_color(ACCENT)),
        ('BOX',         (0, 0), (-1, -1), 0.4, rl_color(MGRAY)),
        ('TOPPADDING',  (0, 0), (-1, -1), 14),
        ('BOTTOMPADDING',(0,0), (-1, -1), 14),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING',(0, 0), (-1, -1), 14),
    ]))
    return tbl

# ---------------------------------------------------------------------------
# PAGE 2 — CLIENT CHARTS
# ---------------------------------------------------------------------------
def build_client_revenue_bar():
    top = sorted(CLIENTS, key=lambda x: x[1], reverse=True)[:10]
    names = [c[0] for c in top]
    revs  = [c[1] for c in top]
    total = sum(c[1] for c in CLIENTS)
    rates = [c[3] for c in top]
    bar_colors = [CLIENT_COLORS[i % len(CLIENT_COLORS)] for i in range(len(top))]

    fig, ax = plt.subplots(figsize=(9, 4.5))
    fig.patch.set_facecolor(WHITE)
    ax.set_facecolor(WHITE)
    bars = ax.barh(names, revs, color=[hex2rgb(c) for c in bar_colors], height=0.55)
    ax.invert_yaxis()
    std_spine(ax)
    ax.spines['bottom'].set_visible(False)
    ax.xaxis.set_visible(False)
    ax.tick_params(axis='y', labelsize=9.5, colors=TEXT)
    for label in ax.get_yticklabels():
        label.set_fontweight('bold')
        label.set_color(hex2rgb(TEXT))

    max_val = max(revs)
    for bar, rev, pct, rate in zip(bars, revs, [r/total*100 for r in revs], rates):
        x = bar.get_width()
        # Top text (revenue)
        ax.text(x + max_val * 0.01, bar.get_y() + bar.get_height() * 0.8,
                fmt_currency(rev), va='center', ha='left',
                fontsize=9, fontweight='bold', color=hex2rgb(TEXT))
        # Bottom text (pct and rate)
        rate_str = f"R{rate:.2f}/km" if rate > 0 else "—"
        ax.text(x + max_val * 0.01, bar.get_y() + bar.get_height() * 0.2,
                f"{pct:.1f}%  •  {rate_str}", va='center', ha='left',
                fontsize=7.5, color=hex2rgb(DGRAY))

    ax.set_xlim(right=max_val * 1.35)
    ax.set_title("Revenue by Client", fontsize=12, fontweight='bold',
                 color=hex2rgb(TEXT), loc='left', pad=14)
    ax.grid(axis='x', color=hex2rgb(LGRAY), linewidth=0.7, zorder=0)
    fig.tight_layout()
    return fig

def build_client_donut():
    top5 = sorted(CLIENTS, key=lambda x: x[1], reverse=True)[:5]
    other_rev = sum(c[1] for c in CLIENTS) - sum(c[1] for c in top5)
    labels = [c[0] for c in top5] + ["Other"]
    values = [c[1] for c in top5] + [other_rev]
    colors_list = [hex2rgb(CLIENT_COLORS[i]) for i in range(5)] + [hex2rgb(MGRAY)]
    total = sum(values)

    fig, ax = plt.subplots(figsize=(4, 4.2))
    fig.patch.set_facecolor(WHITE)
    ax.set_facecolor(WHITE)
    wedges, _ = ax.pie(
        values, colors=colors_list,
        wedgeprops=dict(width=0.52, edgecolor='white', linewidth=2.5),
        startangle=90, counterclock=False
    )
    ax.text(0, 0.07, fmt_currency(total), ha='center', va='center',
            fontsize=11, fontweight='bold', color=hex2rgb(TEXT))
    ax.text(0, -0.12, "Total Revenue", ha='center', va='center',
            fontsize=8, color=hex2rgb(DGRAY))
    patches = [mpatches.Patch(color=hex2rgb(CLIENT_COLORS[i]), label=top5[i][0]) for i in range(5)]
    patches.append(mpatches.Patch(color=hex2rgb(MGRAY), label="Other"))
    ax.legend(handles=patches, loc='lower center', ncol=2, fontsize=7.5,
              frameon=False, bbox_to_anchor=(0.5, -0.15))
    fig.tight_layout()
    return fig

def build_client_rate_bar():
    filtered = [(c[0], c[3]) for c in CLIENTS if c[3] > 0]
    filtered.sort(key=lambda x: x[1], reverse=True)
    names = [c[0] for c in filtered]
    rates = [c[1] for c in filtered]
    bar_colors = [hex2rgb(GREEN) if r >= KPI_RATE else hex2rgb(AMBER) for r in rates]

    fig, ax = plt.subplots(figsize=(9, 3.8))
    fig.patch.set_facecolor(WHITE)
    ax.set_facecolor(WHITE)
    bars = ax.bar(names, rates, color=bar_colors, zorder=3)
    ax.axhline(KPI_RATE, color=hex2rgb(NAVY), linestyle='--', linewidth=1.2,
               label=f'Fleet Avg R{KPI_RATE:.2f}/km', zorder=4)
    std_spine(ax)
    ax.set_ylabel("R/km", fontsize=8, color=hex2rgb(DGRAY))
    ax.tick_params(axis='x', labelsize=7)
    plt.xticks(rotation=40, ha='right')
    ax.grid(axis='y', color=hex2rgb(LGRAY), linewidth=0.7, zorder=0)

    for bar, rate in zip(bars, rates):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
                f"R{rate:.2f}", ha='center', va='bottom',
                fontsize=8, fontweight='bold', color=hex2rgb(TEXT))

    above_patch = mpatches.Patch(color=hex2rgb(GREEN), label='Above fleet avg')
    below_patch = mpatches.Patch(color=hex2rgb(AMBER), label='Below fleet avg')
    ax.legend(handles=[above_patch, below_patch,
                        mpatches.Patch(color=hex2rgb(NAVY), label=f'Fleet Avg R{KPI_RATE:.2f}/km')],
              fontsize=7.5, frameon=False, loc='upper right')
    ax.set_title("Rate per KM by Client", fontsize=12, fontweight='bold',
                 color=hex2rgb(TEXT), loc='left', pad=14)
    fig.tight_layout()
    return fig

# ---------------------------------------------------------------------------
# PAGE 3 — DRIVER CHARTS
# ---------------------------------------------------------------------------
def build_driver_grouped_bar():
    top10 = DRIVERS_ALL[:10]
    names  = [d[0].split()[-1] for d in top10]
    revs   = [d[1] for d in top10]
    active = [(d[1], d[2]) for d in top10 if d[2] > 0]
    rates  = [d[1]/d[2] if d[2] > 0 else 0 for d in top10]

    x = np.arange(len(names))
    fig, ax1 = plt.subplots(figsize=(9.5, 4))
    fig.patch.set_facecolor(WHITE)
    ax1.set_facecolor(WHITE)
    bars = ax1.bar(x, revs, width=0.5, color=hex2rgb(ACCENT), zorder=3)
    std_spine(ax1)
    ax1.set_xticks(x)
    ax1.set_xticklabels(names, fontsize=8)
    ax1.set_ylabel("Revenue", fontsize=8, color=hex2rgb(ACCENT))
    ax1.yaxis.set_major_formatter(
        plt.FuncFormatter(lambda v, _: f"R{int(v/1000)}k")
    )
    ax1.grid(axis='y', color=hex2rgb(LGRAY), linewidth=0.7, zorder=0)

    for bar, rev in zip(bars, revs):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 400,
                 f"R{int(rev/1000)}k", ha='center', va='bottom',
                 fontsize=8, color=hex2rgb(ACCENT), fontweight='bold')

    ax2 = ax1.twinx()
    ax2.set_facecolor(WHITE)
    ax2.plot(x, rates, color=hex2rgb(AMBER), marker='o', markersize=6,
             linewidth=2, zorder=5)
    ax2.fill_between(x, rates, alpha=0.08, color=hex2rgb(AMBER))
    ax2.set_ylabel("Rate R/km", fontsize=8, color=hex2rgb(AMBER))
    ax2.spines['top'].set_visible(False)
    ax2.spines['right'].set_color(AMBER)
    ax2.tick_params(axis='y', colors=AMBER, labelsize=8)

    rev_patch  = mpatches.Patch(color=hex2rgb(ACCENT), label='Revenue')
    rate_patch = mpatches.Patch(color=hex2rgb(AMBER),  label='Rate R/km')
    ax1.legend(handles=[rev_patch, rate_patch], fontsize=7.5, frameon=False, loc='upper right')
    ax1.set_title("Top 10 Drivers — Revenue & Rate", fontsize=12, fontweight='bold',
                  color=hex2rgb(TEXT), loc='left', pad=14)
    fig.tight_layout()
    return fig

def build_driver_scatter():
    active = [(d[0], d[1], d[2]) for d in DRIVERS_ALL if d[2] > 0]
    names  = [d[0] for d in active]
    revs   = [d[1] for d in active]
    kms    = [d[2] for d in active]
    rate_colors = [r/k for r, k in zip(revs, kms)]

    fig, ax = plt.subplots(figsize=(9, 4.5))
    fig.patch.set_facecolor(WHITE)
    ax.set_facecolor(WHITE)
    sc = ax.scatter(kms, revs, c=rate_colors, cmap='Blues', vmin=20, vmax=150,
                    s=80, edgecolors='white', linewidth=0.8, zorder=4)
    cbar = plt.colorbar(sc, ax=ax)
    cbar.set_label('Rate R/km', fontsize=8, color=hex2rgb(DGRAY))
    cbar.outline.set_visible(False)
    cbar.ax.tick_params(labelsize=7.5, colors=DGRAY)

    std_spine(ax)
    ax.grid(axis='both', color=hex2rgb(LGRAY), linewidth=0.7, zorder=0)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"R{int(v/1000)}k"))
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{int(v)}km"))
    ax.set_xlabel("Distance (km)", fontsize=8, color=hex2rgb(DGRAY))
    ax.set_ylabel("Revenue", fontsize=8, color=hex2rgb(DGRAY))

    # Top 5 earners by revenue
    sorted_active = sorted(zip(revs, kms, names), reverse=True)[:5]
    for rev, km, name in sorted_active:
        last = name.split()[-1]
        ax.annotate(last, xy=(km, rev), xytext=(6, 4),
                    textcoords='offset points',
                    fontsize=7.5, color=hex2rgb(INK))

    ax.set_title("Driver Efficiency Scatter", fontsize=12, fontweight='bold',
                 color=hex2rgb(TEXT), loc='left', pad=14)
    fig.tight_layout()
    return fig

# ---------------------------------------------------------------------------
# PAGE 4 — DRIVER LEADERBOARD TABLE
# ---------------------------------------------------------------------------
def build_driver_table(styles):
    col_ws = [W*0.06, W*0.32, W*0.20, W*0.16, W*0.26]
    header = ['#', 'DRIVER', 'REVENUE', 'KM', 'RATE/KM']
    header_cells = [
        Paragraph(h, ParagraphStyle('th', fontName='Helvetica-Bold', fontSize=8,
                                     textColor=rl_color(WHITE), alignment=TA_CENTER))
        for h in header
    ]
    # Driver col left-aligned
    header_cells[1] = Paragraph('DRIVER', ParagraphStyle('thd', fontName='Helvetica-Bold',
                                                           fontSize=8, textColor=rl_color(WHITE), alignment=TA_LEFT))
    # Right-align number cols
    for idx in [2, 3, 4]:
        header_cells[idx] = Paragraph(header[idx], ParagraphStyle(
            'thn', fontName='Helvetica-Bold', fontSize=8,
            textColor=rl_color(WHITE), alignment=TA_RIGHT))
    data = [header_cells]
    medal_colors = [AMBER, DGRAY, "#CD7F32"]

    for i, (name, rev, km) in enumerate(DRIVERS_ALL):
        rank = i + 1
        rev_str = fmt_currency(rev)
        km_str  = f"{km:,}" if km > 0 else "—"
        rate    = rev / km if km > 0 else 0
        rate_str = f"R{rate:.2f}" if km > 0 else "—"

        fn = 'Helvetica-Bold' if rank <= 3 else 'Helvetica'
        rc = medal_colors[i] if rank <= 3 else TEXT
        bg = WHITE if i % 2 == 0 else OFFWHITE

        row = [
            Paragraph(str(rank), ParagraphStyle('td', fontName='Helvetica', fontSize=8, alignment=TA_CENTER, textColor=rl_color(TEXT))),
            Paragraph(name, ParagraphStyle('tdn', fontName=fn,   fontSize=8, textColor=rl_color(TEXT))),
            Paragraph(rev_str, ParagraphStyle('tdr', fontName='Helvetica-Bold' if rank<=3 else 'Helvetica',
                                               fontSize=8, alignment=TA_RIGHT, textColor=rl_color(rc))),
            Paragraph(km_str, ParagraphStyle('tdk', fontName='Helvetica', fontSize=8, alignment=TA_RIGHT, textColor=rl_color(TEXT))),
            Paragraph(rate_str, ParagraphStyle('tdt', fontName='Helvetica', fontSize=8, alignment=TA_RIGHT, textColor=rl_color(TEXT))),
        ]
        data.append((row, bg))

    rows = [data[0]] + [r for r, _ in data[1:]]
    tbl = Table(rows, colWidths=col_ws, repeatRows=1)
    ts = TableStyle([
        ('BACKGROUND',   (0, 0), (-1, 0),  rl_color(NAVY)),
        ('GRID',         (0, 0), (-1, -1), 0.25, rl_color(MGRAY)),
        ('TOPPADDING',   (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
        ('LEFTPADDING',  (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
    ])
    for i, (_, bg) in enumerate(data[1:]):
        ts.add('BACKGROUND', (0, i+1), (-1, i+1), rl_color(bg))
    tbl.setStyle(ts)
    return tbl

# ---------------------------------------------------------------------------
# PAGES 5-6 — ROUTE DETAIL TABLE
# ---------------------------------------------------------------------------
def build_route_table():
    col_ws = [W*0.07, W*0.05, W*0.15, W*0.15, W*0.14, W*0.15, W*0.07, W*0.12, W*0.10]
    headers = ['DATE','TRUCK','DRIVER','CLIENT','FROM','TO','KM','REVENUE','R/KM']
    header_cells = [
        Paragraph(h, ParagraphStyle('rth', fontName='Helvetica-Bold', fontSize=7.5,
                                     textColor=rl_color(WHITE), alignment=TA_CENTER))
        for h in headers
    ]
    # Left-align text cols
    for idx in [2, 3, 4, 5]:
        header_cells[idx] = Paragraph(headers[idx], ParagraphStyle(
            'rthl', fontName='Helvetica-Bold', fontSize=7.5,
            textColor=rl_color(WHITE), alignment=TA_LEFT))
    # Right-align number cols
    for idx in [6, 7, 8]:
        header_cells[idx] = Paragraph(headers[idx], ParagraphStyle(
            'rthn', fontName='Helvetica-Bold', fontSize=7.5,
            textColor=rl_color(WHITE), alignment=TA_RIGHT))

    all_rows = [header_cells]
    for i, (date, truck, driver, client, frm, to, km, rev, rate) in enumerate(ROUTES):
        km_str   = f"{km:,}" if km > 0 else "—"
        rate_str = f"R{rate:.2f}" if rate > 0 else "—"
        bg = WHITE if i % 2 == 0 else OFFWHITE
        row = [
            Paragraph(date,   ParagraphStyle('rtd', fontName='Helvetica', fontSize=7.5, alignment=TA_CENTER, textColor=rl_color(TEXT))),
            Paragraph(truck,  ParagraphStyle('rtt', fontName='Helvetica-Bold', fontSize=7.5, alignment=TA_CENTER, textColor=rl_color(NAVY))),
            Paragraph(driver, ParagraphStyle('rtdr', fontName='Helvetica', fontSize=7.5, textColor=rl_color(TEXT))),
            Paragraph(client, ParagraphStyle('rtc', fontName='Helvetica', fontSize=7.5, textColor=rl_color(TEXT))),
            Paragraph(frm,    ParagraphStyle('rtf', fontName='Helvetica', fontSize=7.5, textColor=rl_color(TEXT))),
            Paragraph(to,     ParagraphStyle('rtto', fontName='Helvetica', fontSize=7.5, textColor=rl_color(TEXT))),
            Paragraph(km_str, ParagraphStyle('rtkm', fontName='Helvetica', fontSize=7.5, alignment=TA_RIGHT, textColor=rl_color(TEXT))),
            Paragraph(fmt_currency(rev), ParagraphStyle('rtr', fontName='Helvetica-Bold', fontSize=7.5, alignment=TA_RIGHT, textColor=rl_color(ACCENT))),
            Paragraph(rate_str, ParagraphStyle('rtrk', fontName='Helvetica', fontSize=7.5, alignment=TA_RIGHT, textColor=rl_color(TEXT))),
        ]
        all_rows.append((row, bg))

    CHUNK = 28
    route_rows = all_rows[1:]
    chunks = [route_rows[i:i+CHUNK] for i in range(0, len(route_rows), CHUNK)]

    tables = []
    for ci, chunk in enumerate(chunks):
        rows = [all_rows[0]] + [r for r, _ in chunk]
        tbl = Table(rows, colWidths=col_ws, repeatRows=1)
        ts = TableStyle([
            ('BACKGROUND',   (0, 0), (-1, 0),  rl_color(NAVY)),
            ('GRID',         (0, 0), (-1, -1), 0.25, rl_color(MGRAY)),
            ('TOPPADDING',   (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING',(0, 0), (-1, -1), 4),
            ('LEFTPADDING',  (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
        ])
        for i, (_, bg) in enumerate(chunk):
            ts.add('BACKGROUND', (0, i+1), (-1, i+1), rl_color(bg))
        tbl.setStyle(ts)
        tables.append(tbl)
        if ci < len(chunks) - 1:
            tables.append(PageBreak())
    return tables

def build_route_totals():
    total_km  = sum(r[6] for r in ROUTES)
    total_rev = sum(r[7] for r in ROUTES)
    blended   = total_rev / total_km if total_km > 0 else 0
    comp_rate = f"{KPI_COMPLETED}/{KPI_ROUTES} routes completed ({int(KPI_COMPLETED/KPI_ROUTES*100)}%)"

    col_ws = [W*0.71, W*0.07, W*0.12, W*0.10]
    row = [
        Paragraph(f"MONTH TOTALS   |   {comp_rate}", ParagraphStyle('tt', fontName='Helvetica-Bold', fontSize=8, textColor=rl_color(TEXT))),
        Paragraph(f"{total_km:,}", ParagraphStyle('tk', fontName='Helvetica-Bold', fontSize=8, alignment=TA_RIGHT, textColor=rl_color(TEXT))),
        Paragraph(fmt_currency(total_rev), ParagraphStyle('tr', fontName='Helvetica-Bold', fontSize=8, alignment=TA_RIGHT, textColor=rl_color(ACCENT))),
        Paragraph(f"R{blended:.2f}", ParagraphStyle('tb', fontName='Helvetica-Bold', fontSize=8, alignment=TA_RIGHT, textColor=rl_color(TEXT))),
    ]
    tbl = Table([row], colWidths=col_ws)
    tbl.setStyle(TableStyle([
        ('BACKGROUND',   (0,0), (-1,-1), rl_color(OFFWHITE)),
        ('BOX',          (0,0), (-1,-1), 0.8, rl_color(ACCENT)),
        ('INNERGRID',    (0,0), (-1,-1), 0.4, rl_color(MGRAY)),
        ('TOPPADDING',   (0,0), (-1,-1), 10),
        ('BOTTOMPADDING',(0,0), (-1,-1), 10),
        ('LEFTPADDING',  (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('VALIGN',       (0,0), (-1,-1), 'MIDDLE'),
    ]))
    return tbl

# ---------------------------------------------------------------------------
# BUILD DOCUMENT
# ---------------------------------------------------------------------------
def build_report(output_path):
    styles = make_styles()

    doc = BaseDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=LM,
        rightMargin=RM,
        topMargin=TM + HEADER_H,
        bottomMargin=BM + FOOTER_H,
    )

    frame = Frame(LM, BM + FOOTER_H, W, PH - TM - HEADER_H - BM - FOOTER_H,
                  id='main', leftPadding=0, rightPadding=0,
                  topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id='main', frames=[frame])])

    story = []

    # ------------------------------------------------------------------ PAGE 1
    story.append(Paragraph(f"Monthly Operations  •  {PERIOD}", styles['cover_period']))
    story.append(Paragraph("Monthly Operations", styles['cover_title']))
    story.append(Paragraph("Report", styles['cover_title']))
    story.append(Paragraph(f"FleetCore Logistics  •  Confidential", styles['cover_sub']))
    story.append(HRFlowable(width="100%", thickness=0.6, color=rl_color(MGRAY), spaceAfter=14))

    story.extend(section_label("Key Performance Indicators", styles))
    story.append(build_kpi_cards(styles))
    story.append(Spacer(1, 16))
    story.append(build_insight_box(styles))
    story.append(PageBreak())

    # ------------------------------------------------------------------ PAGE 2
    story.append(Paragraph("Client Performance", styles['title']))
    story.append(Paragraph(f"Revenue and rate analysis by client — {PERIOD}", styles['subtitle']))

    story.extend(section_label("Revenue by Client", styles))
    # Side-by-side: bar chart + donut
    fig_bar  = build_client_revenue_bar()
    fig_dnt  = build_client_donut()
    bar_img  = fig_to_image(fig_bar,  width=W * 0.685)
    dnt_img  = fig_to_image(fig_dnt,  width=W * 0.305)
    side_tbl = Table([[bar_img, dnt_img]], colWidths=[W * 0.685, W * 0.315])
    side_tbl.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING',  (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING',   (0,0), (-1,-1), 0),
        ('BOTTOMPADDING',(0,0), (-1,-1), 0),
    ]))
    story.append(side_tbl)
    story.append(Spacer(1, 10))

    story.extend(section_label("Rate per KM by Client", styles))
    fig_rate = build_client_rate_bar()
    story.append(fig_to_image(fig_rate, width=W))
    story.append(PageBreak())

    # ------------------------------------------------------------------ PAGE 3
    story.append(Paragraph("Driver Performance", styles['title']))
    story.append(Paragraph(f"Individual revenue, distance, and efficiency — {PERIOD}", styles['subtitle']))

    story.extend(section_label("Top 10 Drivers — Revenue & Rate", styles))
    fig_grp = build_driver_grouped_bar()
    story.append(fig_to_image(fig_grp, width=W))
    story.append(Spacer(1, 10))

    story.extend(section_label("Driver Efficiency Scatter", styles))
    fig_scat = build_driver_scatter()
    story.append(fig_to_image(fig_scat, width=W))
    story.append(PageBreak())

    # ------------------------------------------------------------------ PAGE 4
    story.append(Paragraph("Full Driver Leaderboard", styles['title']))
    story.append(Paragraph(f"All drivers ranked by revenue — {PERIOD}", styles['subtitle']))
    story.extend(section_label("Driver Rankings", styles))
    story.append(build_driver_table(styles))
    story.append(PageBreak())

    # ------------------------------------------------------------------ PAGES 5-6
    story.append(Paragraph("Route Detail", styles['title']))
    story.append(Paragraph(
        f"Complete route log — {PERIOD}  •  {KPI_COMPLETED} completed routes shown",
        styles['subtitle']))
    story.extend(section_label("Route Log", styles))
    route_tables = build_route_table()
    story.extend(route_tables)
    story.append(Spacer(1, 12))
    story.extend(section_label("Month Totals", styles))
    story.append(build_route_totals())

    doc.build(story, canvasmaker=FleetcoreCanvas)
    print(f"✅ Report written to: {output_path}")

# ---------------------------------------------------------------------------
if __name__ == '__main__':
    build_report("fleetcore_report_march2026.pdf")

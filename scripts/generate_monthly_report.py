#!/usr/bin/env python3
"""
FleetCore Executive Monthly Operations Report Generator
Generates a professional 6-page PDF report using ReportLab and Matplotlib
Report specification: March 2026 FleetCore Operations
"""

import io
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# ─── Constants & Setup ────────────────────────────────────────────────────────

PW, PH = A4  # 595 x 842 pts
LM = RM = 16 * mm
TM = BM = 16 * mm
W = PW - LM - RM
HEADER_H = 18 * mm
FOOTER_H = 10 * mm

# Colour Palette
INK = "#0D1B2A"
NAVY = "#1B2B4B"
STEEL = "#2C4A7C"
ACCENT = "#1D6FE8"
SKY = "#38BDF8"
GREEN = "#10B981"
AMBER = "#F59E0B"
RED = "#EF4444"
PURPLE = "#8B5CF6"
TEAL = "#14B8A6"
WHITE = "#FFFFFF"
OFFWHITE = "#F9FAFB"
LGRAY = "#F1F5F9"
MGRAY = "#CBD5E1"
DGRAY = "#64748B"
TEXT = "#1E293B"
MUTED = "#94A3B8"

CLIENT_COLORS = [ACCENT, STEEL, TEAL, GREEN, AMBER, PURPLE,
                 SKY, "#F97316", "#EC4899", DGRAY, "#6366F1", MUTED, "#84CC16"]

# ─── Canvas Subclass for Page Chrome ──────────────────────────────────────────

class BrandedCanvas(Canvas):
    """Custom canvas that draws header and footer on every page"""
    
    def __init__(self, *args, **kwargs):
        Canvas.__init__(self, *args, **kwargs)
        self.page_num = 0
        self.total_pages = None
    
    def showPage(self):
        self.page_num += 1
        self._drawPageChrome()
        Canvas.showPage(self)
    
    def save(self):
        # Last page: only call save, not showPage
        # But we need to draw chrome for it too
        if self.page_num > 0:
            self._drawPageChrome()
        Canvas.save(self)
    
    def _drawPageChrome(self):
        """Draw header and footer on current page"""
        # ─── Header (18mm height) ───
        # Navy background
        self.setFillColor(colors.HexColor(NAVY))
        self.rect(0, PH - HEADER_H, PW, HEADER_H, fill=1, stroke=0)
        
        # Left accent stripe (3.5pt wide)
        self.setFillColor(colors.HexColor(ACCENT))
        self.rect(0, PH - HEADER_H, 3.5, HEADER_H, fill=1, stroke=0)
        
        # Wordmark (FLEETCORE)
        self.setFont("Helvetica-Bold", 13)
        self.setFillColor(colors.HexColor(WHITE))
        self.drawString(LM, PH - 11.5 * mm, "FLEETCORE")
        
        # Subtitle
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor(SKY))
        self.drawString(LM + 45 * mm, PH - 11.5 * mm, "Monthly Operations Report")
        
        # Top-right info
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor(MUTED))
        self.drawRightString(PW - LM, PH - 8.5 * mm, "March 2026 | Confidential")
        self.drawRightString(PW - LM, PH - 13 * mm, f"Page {self.page_num}")
        
        # Accent rule at bottom of header
        self.setStrokeColor(colors.HexColor(ACCENT))
        self.setLineWidth(0.8)
        self.line(0, PH - HEADER_H, PW, PH - HEADER_H)
        
        # ─── Footer (10mm height) ───
        # Light gray background
        self.setFillColor(colors.HexColor(LGRAY))
        self.rect(0, 0, PW, FOOTER_H, fill=1, stroke=0)
        
        # Footer text
        self.setFont("Helvetica", 7)
        self.setFillColor(colors.HexColor(MUTED))
        footer_text = "FleetCore Logistics  •  For internal and executive use only  •  Generated 2 April 2026"
        self.drawString(LM, 4 * mm, footer_text)
        self.drawRightString(PW - LM, 4 * mm, "fleetcore.co.za")


# ─── Helper Functions ─────────────────────────────────────────────────────────

def fmt(val):
    """Format large currency values (e.g., 1390041 -> R1 390 041)"""
    if val == 0:
        return "R0"
    s = f"{int(val):,}"
    # Replace commas with spaces and handle R prefix
    s = s.replace(',', ' ')
    return f"R{s}"

def fmtNum(val):
    """Format number with spaces (e.g., 25582 -> 25 582)"""
    if val == 0:
        return "0"
    return f"{int(val):,}".replace(',', ' ')

def fmtRate(val):
    """Format rate per km"""
    if val == 0:
        return "—"
    return f"R{val:.2f}/km"

def fmtKm(val):
    """Format km value"""
    if val == 0:
        return "—"
    return f"{int(val)} km"

def fmtRevenue(val):
    """Format revenue for tables"""
    if val == 0:
        return "—"
    return fmt(val)

def hex_to_rgb(hex_color):
    """Convert hex color to RGB tuple (0-1 range for matplotlib)"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16)/255.0 for i in (0, 2, 4))

def get_section_label(text):
    """Create section label paragraph"""
    style = ParagraphStyle(
        'SectionLabel',
        fontName='Helvetica-Bold',
        fontSize=7.5,
        textColor=colors.HexColor(MUTED),
        letterSpacing=1.5,
    )
    return Paragraph(text.upper(), style)

def create_char_image(fig, width_mm=100):
    """Convert matplotlib figure to ReportLab Image"""
    img_buffer = io.BytesIO()
    fig.savefig(img_buffer, format='png', dpi=100, bbox_inches='tight', facecolor='white', pad_inches=0.05)
    img_buffer.seek(0)
    plt.close(fig)
    
    # Safe width constraint
    width_pt = min(width_mm * mm, W * 0.9)
    
    img = Image(img_buffer, width=width_pt)
    return img

# ─── Chart Functions ──────────────────────────────────────────────────────────

def chart_revenue_bars(clients_data):
    """Horizontal revenue bar chart (top 10 clients)"""
    # Sort by revenue, take top 10
    sorted_clients = sorted(clients_data, key=lambda x: x[1], reverse=True)[:10]
    names = [c[0] for c in sorted_clients]
    revenues = [c[1] for c in sorted_clients]
    rates = [c[4] for c in sorted_clients]
    routes = [c[2] for c in sorted_clients]
    
    total_rev = sum(r[1] for r in clients_data)
    
    fig, ax = plt.subplots(figsize=(6.5, 3.5), dpi=100)
    
    # Create bars
    y_pos = np.arange(len(names))
    colors_map = [hex_to_rgb(CLIENT_COLORS[i % len(CLIENT_COLORS)]) for i in range(len(names))]
    
    bars = ax.barh(y_pos, revenues, height=0.55, color=colors_map, edgecolor='none')
    
    # Add value labels on the right
    for i, (rev, rate, route) in enumerate(zip(revenues, rates, routes)):
        pct = (rev / total_rev) * 100
        rate_label = f" • R{rate:.2f}/km" if rate > 0 else ""
        ax.text(rev + 5000, i, f"R{rev:,.0f}", va='center', fontsize=9, fontweight='bold', color=TEXT)
        ax.text(rev + 5000, i - 0.35, f"{pct:.1f}% of total{rate_label}", va='center', fontsize=7.5, color=DGRAY)
    
    ax.set_yticks(y_pos)
    ax.set_yticklabels(names, fontsize=9.5, fontweight='bold')
    ax.set_xlim(0, max(revenues) * 1.25)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_visible(False)
    ax.spines['bottom'].set_visible(False)
    ax.set_xticks([])
    ax.yaxis.set_ticks_position('left')
    
    ax.set_facecolor(WHITE)
    fig.patch.set_facecolor(WHITE)
    
    return fig

def chart_revenue_donut(clients_data):
    """Donut chart for revenue mix (top 5 + Other)"""
    sorted_clients = sorted(clients_data, key=lambda x: x[1], reverse=True)
    total_rev = sum(c[1] for c in clients_data)
    
    # Top 5 + Other
    top5_data = sorted_clients[:5]
    other_rev = sum(c[1] for c in sorted_clients[5:])
    
    labels = [c[0] for c in top5_data] + ['Other']
    values = [c[1] for c in top5_data] + [other_rev]
    colors_map = [hex_to_rgb(CLIENT_COLORS[i]) for i in range(len(top5_data))] + [hex_to_rgb(DGRAY)]
    
    fig, ax = plt.subplots(figsize=(4, 4.2), dpi=200)
    
    wedges, texts, autotexts = ax.pie(
        values, labels=labels, colors=colors_map, autopct='%1.1f%%',
        startangle=90, textprops={'fontsize': 7.5, 'color': TEXT, 'fontweight': 'bold'}
    )
    
    # Draw donut
    centre_circle = plt.Circle((0, 0), 0.52, fc=WHITE, edgecolor=WHITE, linewidth=2.5)
    ax.add_artist(centre_circle)
    
    # Centre text
    ax.text(0, 0.08, fmt(total_rev), ha='center', va='center', fontsize=11, fontweight='bold', color=ACCENT)
    ax.text(0, -0.15, 'Total Revenue', ha='center', va='center', fontsize=8, color=DGRAY)
    
    # Legend below
    ax.legend(labels, loc='upper center', bbox_to_anchor=(0.5, -0.05), ncol=2, fontsize=7.5, frameon=False)
    
    ax.set_facecolor(WHITE)
    fig.patch.set_facecolor(WHITE)
    
    return fig

def chart_rate_by_client(clients_data):
    """Vertical bar chart: Rate per KM by client (above/below fleet avg)"""
    fleet_avg = 54.34
    
    # Sort by rate descending, exclude zero rates
    active = [c for c in clients_data if c[4] > 0]
    sorted_by_rate = sorted(active, key=lambda x: x[4], reverse=True)
    
    names = [c[0] for c in sorted_by_rate]
    rates = [c[4] for c in sorted_by_rate]
    
    # Color by above/below average
    colors_map = [hex_to_rgb(GREEN) if r >= fleet_avg else hex_to_rgb(AMBER) for r in rates]
    
    fig, ax = plt.subplots(figsize=(9, 3.8), dpi=200)
    
    x_pos = np.arange(len(names))
    bars = ax.bar(x_pos, rates, color=colors_map, edgecolor='none', width=0.7)
    
    # Add value labels above bars
    for i, (bar, rate) in enumerate(zip(bars, rates)):
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 1,
                f'R{rate:.0f}', ha='center', va='bottom', fontsize=8, fontweight='bold', color=TEXT)
    
    # Fleet average line
    ax.axhline(y=fleet_avg, color=NAVY, linestyle='--', linewidth=1, alpha=0.6, zorder=0)
    ax.text(len(names) - 0.5, fleet_avg + 2, f'Fleet avg R{fleet_avg:.2f}/km', 
            fontsize=7.5, color=NAVY, fontweight='bold')
    
    ax.set_xticks(x_pos)
    ax.set_xticklabels(names, rotation=15, ha='right', fontsize=8.5)
    ax.set_ylabel('Rate (R/km)', fontsize=8.5, fontweight='bold', color=TEXT)
    ax.set_ylim(0, max(rates) * 1.15)
    
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color(MGRAY)
    ax.spines['left'].set_color(MGRAY)
    ax.tick_params(colors=DGRAY)
    ax.grid(axis='y', color=LGRAY, linewidth=0.7, zorder=0)
    
    # Legend
    green_patch = mpatches.Patch(color=hex_to_rgb(GREEN), label='Above fleet avg')
    amber_patch = mpatches.Patch(color=hex_to_rgb(AMBER), label='Below fleet avg')
    ax.legend(handles=[green_patch, amber_patch], loc='upper right', fontsize=7.5, frameon=False)
    
    ax.set_facecolor(WHITE)
    fig.patch.set_facecolor(WHITE)
    
    return fig

def chart_top_drivers_combo(drivers_data):
    """Top 10 drivers: bars (revenue) + line (rate)"""
    top10 = sorted(drivers_data, key=lambda x: x[1], reverse=True)[:10]
    
    names = [d[0].split()[-1] for d in top10]  # Last name only
    revenues = [d[1] for d in top10]
    kms = [d[2] for d in top10]
    rates = [d[1] / d[2] if d[2] > 0 else 0 for d in top10]
    
    fig, ax1 = plt.subplots(figsize=(9.5, 4), dpi=200)
    
    x_pos = np.arange(len(names))
    
    # Revenue bars
    bars = ax1.bar(x_pos, revenues, color=hex_to_rgb(ACCENT), edgecolor='none', width=0.5)
    ax1.set_ylabel('Revenue (R)', fontsize=8.5, fontweight='bold', color=ACCENT)
    ax1.tick_params(axis='y', labelcolor=ACCENT)
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'R{x/1000:.0f}k'))
    
    # Add value labels above bars
    for bar, rev in zip(bars, revenues):
        height = bar.get_height()
        ax1.text(bar.get_x() + bar.get_width()/2., height + 1000,
                f'R{rev/1000:.0f}k', ha='center', va='bottom', fontsize=8, fontweight='bold', color=ACCENT)
    
    # Rate line on twin axis
    ax2 = ax1.twinx()
    line = ax2.plot(x_pos, rates, color=hex_to_rgb(AMBER), marker='o', linewidth=2, markersize=6, label='Rate R/km')
    ax2.set_ylabel('Rate (R/km)', fontsize=8.5, fontweight='bold', color=AMBER)
    ax2.tick_params(axis='y', labelcolor=AMBER)
    ax2.fill_between(x_pos, rates, alpha=0.08, color=hex_to_rgb(AMBER))
    
    ax1.set_xticks(x_pos)
    ax1.set_xticklabels(names, fontsize=8.5)
    ax1.set_xlabel('Driver', fontsize=8.5, fontweight='bold', color=TEXT)
    
    ax1.spines['top'].set_visible(False)
    ax1.spines['right'].set_visible(False)
    ax1.spines['left'].set_color(ACCENT)
    ax1.spines['bottom'].set_color(MGRAY)
    ax2.spines['top'].set_visible(False)
    ax2.spines['left'].set_visible(False)
    ax2.spines['right'].set_color(AMBER)
    
    ax1.grid(axis='y', color=LGRAY, linewidth=0.7, zorder=0)
    
    # Legend
    blue_patch = mpatches.Patch(color=hex_to_rgb(ACCENT), label='Revenue')
    amber_patch = mpatches.Patch(color=hex_to_rgb(AMBER), label='Rate R/km')
    ax1.legend(handles=[blue_patch, amber_patch], loc='upper left', fontsize=7.5, frameon=False)
    
    ax1.set_facecolor(WHITE)
    fig.patch.set_facecolor(WHITE)
    
    return fig

def chart_driver_efficiency_scatter(drivers_data):
    """Driver efficiency scatter: Revenue vs Distance, colored by rate"""
    # Only drivers with km > 0
    active_drivers = [d for d in drivers_data if d[2] > 0]
    
    names = [d[0].split()[-1] for d in active_drivers]  # Last name
    revenues = [d[1] for d in active_drivers]
    kms = [d[2] for d in active_drivers]
    rates = [d[1] / d[2] if d[2] > 0 else 0 for d in active_drivers]
    
    fig, ax = plt.subplots(figsize=(9, 4.5), dpi=200)
    
    # Scatter with rate as color
    scatter = ax.scatter(kms, revenues, c=rates, cmap='Blues', s=80, edgecolor=WHITE, linewidth=0.8,
                        vmin=20, vmax=150, zorder=3)
    
    # Colorbar
    cbar = plt.colorbar(scatter, ax=ax)
    cbar.set_label('Rate R/km', fontsize=8.5, fontweight='bold', color=TEXT)
    cbar.outline.set_visible(False)
    
    # Annotate top 5 earners
    top5_idx = sorted(range(len(revenues)), key=lambda i: revenues[i], reverse=True)[:5]
    for idx in top5_idx:
        ax.annotate(names[idx], (kms[idx], revenues[idx]), 
                   xytext=(6, 4), textcoords='offset points', fontsize=7.5,
                   color=INK, fontweight='bold')
    
    ax.set_xlabel('Distance Driven (km)', fontsize=8.5, fontweight='bold', color=TEXT)
    ax.set_ylabel('Revenue', fontsize=8.5, fontweight='bold', color=TEXT)
    
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{x:.0f}km'))
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'R{x/1000:.0f}k'))
    
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color(MGRAY)
    ax.spines['left'].set_color(MGRAY)
    ax.tick_params(colors=DGRAY)
    ax.grid(True, color=LGRAY, linewidth=0.5, alpha=0.5, zorder=0)
    
    ax.set_facecolor(WHITE)
    fig.patch.set_facecolor(WHITE)
    
    return fig

# ─── Data Setup ───────────────────────────────────────────────────────────────

CLIENTS = [
    ("SHAVECO",               370589, 2, 49.57, 49.57),
    ("GEO PARKES",            196292, 2, 63.94, 63.94),
    ("POLEYARD",              130922, 2, 35.89, 35.89),
    ("GEELHOUTVLEI",          121348, 2, 92.63, 92.63),
    ("GOLDEN HARVEST",         95519, 2, 58.10, 58.10),
    ("MTO FORESTRY",           92280, 2, 44.39, 44.39),
    ("ALIEN TREE SOLUTIONS",   55735, 2, 51.85, 51.85),
    ("UNIVERSAL LEAF",         36919, 2,  0.00, 0.00),
    ("AHRHOF FUTTERGUT",       36000, 2,  0.00, 0.00),
    ("THE SUNSHADERS",         31148, 2, 21.05, 21.05),
    ("RICHARD KANE",           21696, 2,  0.00, 0.00),
    ("TIMBER TWO PROCESSES",   20246, 2, 29.77, 29.77),
    ("SUB SAHARA SOLAR",       18500, 2, 29.79, 29.79),
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

# ─── Report Building ──────────────────────────────────────────────────────────

def build_report(pdf_path):
    """Build the complete 6-page report"""
    
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        topMargin=TM + HEADER_H,
        bottomMargin=BM + FOOTER_H,
        leftMargin=LM,
        rightMargin=RM,
        canvasmaker=BrandedCanvas
    )
    
    story = []
    ss = getSampleStyleSheet()
    
    # ─── Page 1: Cover ────────────────────────────────────────────────────────
    
    # Period label
    title_style = ParagraphStyle(
        'Title',
        fontName='Helvetica',
        fontSize=8,
        textColor=colors.HexColor(DGRAY),
        spaceAfter=8
    )
    story.append(Paragraph("March 2026", title_style))
    
    # Main title
    main_title = ParagraphStyle(
        'MainTitle',
        fontName='Helvetica-Bold',
        fontSize=30,
        textColor=colors.HexColor(INK),
        spaceAfter=6,
        leading=34
    )
    story.append(Paragraph("Monthly Operations<br/>Report", main_title))
    
    # Subtitle
    subtitle_style = ParagraphStyle(
        'Subtitle',
        fontName='Helvetica',
        fontSize=9,
        textColor=colors.HexColor(TEXT),
        spaceAfter=12
    )
    story.append(Paragraph("FleetCore Logistics • Confidential", subtitle_style))
    
    # HR rule
    story.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor(MGRAY), spaceAfter=18))
    
    # KPI Cards
    kpi_data = [
        [
            Paragraph(f"<b>{fmt(1390041)}</b><br/><font size=8>Total Revenue</font><br/><font size=7.5 color='{DGRAY}'>March 2026</font>",
                     ParagraphStyle('KPI', fontName='Helvetica', fontSize=9, textColor=colors.HexColor(ACCENT), alignment=TA_CENTER)),
            Paragraph(f"<b>{fmtNum(25582)} km</b><br/><font size=8>Total Distance</font><br/><font size=7.5 color='{DGRAY}'>102 routes dispatched</font>",
                     ParagraphStyle('KPI', fontName='Helvetica', fontSize=9, textColor=colors.HexColor(TEAL), alignment=TA_CENTER)),
            Paragraph(f"<b>93%</b><br/><font size=8>Completion Rate</font><br/><font size=7.5 color='{DGRAY}'>95 of 102 completed</font>",
                     ParagraphStyle('KPI', fontName='Helvetica', fontSize=9, textColor=colors.HexColor(GREEN), alignment=TA_CENTER)),
            Paragraph(f"<b>R54.34/km</b><br/><font size=8>Fleet Avg Rate</font><br/><font size=7.5 color='{DGRAY}'>Blended all clients</font>",
                     ParagraphStyle('KPI', fontName='Helvetica', fontSize=9, textColor=colors.HexColor(PURPLE), alignment=TA_CENTER)),
        ]
    ]
    
    kpi_table = Table(kpi_data, colWidths=[W/4]*4)
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(OFFWHITE)),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 13),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 13),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('BORDER', (0, 0), (-1, -1), 0.4, colors.HexColor(MGRAY)),
        ('LINEABOVE', (0, 0), (0, -1), 2.5, colors.HexColor(ACCENT)),
        ('LINEABOVE', (1, 0), (1, -1), 2.5, colors.HexColor(TEAL)),
        ('LINEABOVE', (2, 0), (2, -1), 2.5, colors.HexColor(GREEN)),
        ('LINEABOVE', (3, 0), (3, -1), 2.5, colors.HexColor(PURPLE)),
    ]))
    
    story.append(kpi_table)
    story.append(Spacer(W, 20))
    
    # Executive Insight Box
    insight_text = (
        "FleetCore completed <b>95 of 102 dispatched routes</b> in March 2026, achieving a <b>93% completion rate</b> "
        "and generating total revenue of <b>R1 390 041</b> across <b>25 582 km</b> of operations. <b>SHAVECO</b> remained "
        "the dominant client at R370 589 (27% of revenue), with <b>GEO PARKES</b> and <b>POLEYARD</b> rounding out the top three. "
        "Fleet rate averaged <b>R54.34/km</b>. Top earner for the month was <b>Vusumzi Khahlula</b> at R63 691. "
        "<b>GEELHOUTVLEI</b> delivered the highest rate per km at R92.63 — nearly double the fleet average — indicating "
        "strong load premiums on short-haul timber runs."
    )
    
    insight_style = ParagraphStyle(
        'Insight',
        fontName='Helvetica',
        fontSize=9.5,
        textColor=colors.HexColor(TEXT),
        alignment=TA_JUSTIFY,
        leading=15
    )
    
    insight_box_data = [
        [Paragraph("<b>Executive Summary</b><br/><br/>" + insight_text, insight_style)]
    ]
    
    insight_table = Table(insight_box_data, colWidths=[W])
    insight_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
        ('BORDER', (0, 0), (-1, -1), 0.4, colors.HexColor(MGRAY)),
        ('LINEUP', (0, 0), (-1, -1), 2, colors.HexColor(ACCENT)),
        ('TOPPADDING', (0, 0), (-1, -1), 14),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
    ]))
    
    story.append(insight_table)
    story.append(PageBreak())
    
    # ─── Page 2: Client Performance ───────────────────────────────────────────
    
    # Title and subtitle
    page_title = ParagraphStyle('PageTitle', fontName='Helvetica-Bold', fontSize=18, textColor=colors.HexColor(INK), spaceAfter=3)
    story.append(Paragraph("Client Performance", page_title))
    
    subtitle_style2 = ParagraphStyle('Subtitle2', fontName='Helvetica', fontSize=9, textColor=colors.HexColor(DGRAY), spaceAfter=14)
    story.append(Paragraph("Revenue and rate analysis by client — March 2026", subtitle_style2))
    
    # Section: Revenue by Client
    story.append(get_section_label("REVENUE BY CLIENT"))
    story.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor(MGRAY), spaceAfter=10))
    
    # Create charts
    fig_rev_bars = chart_revenue_bars(CLIENTS)
    img_rev_bars = create_char_image(fig_rev_bars, width_mm=120)
    
    fig_donut = chart_revenue_donut(CLIENTS)
    img_donut = create_char_image(fig_donut, width_mm=80)
    
    # Side-by-side layout
    charts_data = [[img_rev_bars, img_donut]]
    charts_table = Table(charts_data, colWidths=[W*0.685, W*0.315], rowHeights=[160])
    charts_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(charts_table)
    story.append(Spacer(W, 12))
    
    # Section: Rate per KM
    story.append(get_section_label("RATE PER KM BY CLIENT"))
    story.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor(MGRAY), spaceAfter=10))
    
    fig_rate = chart_rate_by_client(CLIENTS)
    img_rate = create_char_image(fig_rate, width_mm=120)
    story.append(img_rate)
    
    story.append(PageBreak())
    
    # ─── Page 3: Driver Performance ───────────────────────────────────────────
    
    story.append(Paragraph("Driver Performance", page_title))
    story.append(Paragraph("Individual revenue, distance, and efficiency — March 2026", subtitle_style2))
    
    # Top 10 Drivers
    story.append(get_section_label("TOP 10 DRIVERS — REVENUE & RATE PER KM"))
    story.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor(MGRAY), spaceAfter=10))
    
    fig_combo = chart_top_drivers_combo(DRIVERS_ALL)
    img_combo = create_char_image(fig_combo, width_mm=120)
    story.append(img_combo)
    story.append(Spacer(W, 10))
    
    # Driver Efficiency
    story.append(get_section_label("DRIVER EFFICIENCY — REVENUE VS DISTANCE (ALL ACTIVE DRIVERS)"))
    story.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor(MGRAY), spaceAfter=10))
    
    fig_scatter = chart_driver_efficiency_scatter(DRIVERS_ALL)
    img_scatter = create_char_image(fig_scatter, width_mm=120)
    story.append(img_scatter)
    
    story.append(PageBreak())
    
    # ─── Page 4: Full Driver Leaderboard ──────────────────────────────────────
    
    story.append(Paragraph("Full Driver Leaderboard", page_title))
    story.append(Paragraph("All drivers ranked by revenue — March 2026", subtitle_style2))
    
    # Table data
    table_data = [['#', 'DRIVER', 'REVENUE', 'KM', 'RATE/KM']]
    
    for idx, (name, rev, km) in enumerate(DRIVERS_ALL, 1):
        rate = rev / km if km > 0 else 0
        
        # Format values
        km_str = fmtKm(km)
        rate_str = fmtRate(rate)
        rev_str = fmtRevenue(rev)
        
        table_data.append([
            str(idx),
            name,
            rev_str,
            km_str,
            rate_str
        ])
    
    # Create table
    leaderboard = Table(table_data, colWidths=[W*0.06, W*0.32, W*0.20, W*0.16, W*0.26])
    
    # Styling
    style_commands = [
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(NAVY)),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor(WHITE)),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor(MGRAY)),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # # column
        ('ALIGN', (1, 1), (1, -1), 'LEFT'),    # Driver column
        ('ALIGN', (2, 1), (-1, -1), 'CENTER'), # Other columns
    ]
    
    # Alternating rows
    for i in range(1, len(table_data)):
        if i % 2 == 0:
            style_commands.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor(OFFWHITE)))
        
        # Top 3: colored revenue
        if i <= 3:
            style_commands.append(('FONTNAME', (1, i), (1, i), 'Helvetica-Bold'))
            colors_top3 = [colors.HexColor(AMBER), colors.HexColor(DGRAY), colors.HexColor("#CD7F32")]
            style_commands.append(('TEXTCOLOR', (2, i), (2, i), colors_top3[i-1]))
    
    leaderboard.setStyle(TableStyle(style_commands))
    story.append(leaderboard)
    story.append(PageBreak())
    
    # ─── Pages 5-6: Route Detail ──────────────────────────────────────────────
    
    story.append(Paragraph("Route Detail", page_title))
    story.append(Paragraph("Complete route log — March 2026 • 95 completed routes shown", subtitle_style2))
    
    # Build route table
    route_data = [['DATE', 'TRUCK', 'DRIVER', 'CLIENT', 'FROM', 'TO', 'KM', 'REVENUE', 'R/KM']]
    
    for route in ROUTES:
        date, truck, driver, client, frm, to, km, rev, rate = route
        
        km_str = fmtKm(km)
        rev_str = fmtRevenue(rev)
        rate_str = fmtRate(rate)
        
        route_data.append([date, truck, driver, client, frm, to, km_str, rev_str, rate_str])
    
    # Paginate: 28 routes per table
    routes_per_page = 28
    
    for page_idx in range(0, len(route_data) - 1, routes_per_page):
        chunk_data = [route_data[0]] + route_data[page_idx + 1:page_idx + 1 + routes_per_page]
        
        route_table = Table(chunk_data, colWidths=[W*0.09, W*0.07, W*0.17, W*0.16, W*0.10, W*0.14, W*0.07, W*0.11, W*0.09])
        
        style_cmds = [
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7.5),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(NAVY)),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor(WHITE)),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor(MGRAY)),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]
        
        # Alternating rows
        for i in range(1, len(chunk_data)):
            if i % 2 == 0:
                style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor(OFFWHITE)))
            
            # Truck bold, navy
            style_cmds.append(('FONTNAME', (1, i), (1, i), 'Helvetica-Bold'))
            style_cmds.append(('TEXTCOLOR', (1, i), (1, i), colors.HexColor(NAVY)))
            
            # Revenue bold, accent
            style_cmds.append(('FONTNAME', (7, i), (7, i), 'Helvetica-Bold'))
            style_cmds.append(('TEXTCOLOR', (7, i), (7, i), colors.HexColor(ACCENT)))
        
        route_table.setStyle(TableStyle(style_cmds))
        story.append(route_table)
        story.append(Spacer(W, 8))
        
        if page_idx + routes_per_page < len(route_data) - 1:
            story.append(PageBreak())
    
    # Totals row
    totals_data = [
        [
            Paragraph("<b>MONTH<br/>TOTALS</b>", ParagraphStyle('TotalLabel', fontName='Helvetica-Bold', fontSize=8, textColor=colors.HexColor(TEXT), alignment=TA_CENTER)),
            Paragraph(f"<b>{fmtNum(25582)} km</b> total distance", ParagraphStyle('Total', fontName='Helvetica', fontSize=8, textColor=colors.HexColor(TEXT))),
            Paragraph(f"<b>{fmt(1390041)}</b> total revenue", ParagraphStyle('Total', fontName='Helvetica-Bold', fontSize=8, textColor=colors.HexColor(ACCENT))),
            Paragraph(f"<b>R54.34/km</b> blended rate", ParagraphStyle('Total', fontName='Helvetica', fontSize=8, textColor=colors.HexColor(TEXT))),
            Paragraph(f"<b style='color: {GREEN}'>93%</b> completion rate", ParagraphStyle('Total', fontName='Helvetica', fontSize=8, textColor=colors.HexColor(TEXT))),
        ]
    ]
    
    totals_table = Table(totals_data, colWidths=[W*0.12, W*0.22, W*0.22, W*0.22, W*0.22])
    totals_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(OFFWHITE)),
        ('BORDER', (0, 0), (-1, -1), 0.8, colors.HexColor(ACCENT)),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    
    story.append(Spacer(W, 12))
    story.append(totals_table)
    
    # Build PDF
    doc.build(story, canvasmaker=BrandedCanvas)
    print(f"✓ Report generated: {pdf_path}")

# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    pdf_output = "c:\\dev\\Fleetcor\\March_2026_Operations_Report.pdf"
    build_report(pdf_output)

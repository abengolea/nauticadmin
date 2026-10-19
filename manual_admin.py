#!/usr/bin/env python3
"""Manual de usuario para administradores de nautica - NauticAdmin"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import Flowable

# === COLORES ===
NAVY       = HexColor("#0F2B5B")   # azul marino oscuro
OCEAN      = HexColor("#1565C0")   # azul principal
SKY        = HexColor("#1E88E5")   # azul claro
LIGHT_BLUE = HexColor("#E3F2FD")   # fondo secciones
ACCENT     = HexColor("#FF6B35")   # naranja acento
WARN_BG    = HexColor("#FFF3E0")   # fondo advertencia
WARN_BORDER= HexColor("#FF8F00")   # borde advertencia
DANGER_BG  = HexColor("#FFEBEE")   # fondo peligro
DANGER_BR  = HexColor("#C62828")   # borde peligro
TIP_BG     = HexColor("#E8F5E9")   # fondo consejo
TIP_BR     = HexColor("#2E7D32")   # borde consejo
GRAY_DARK  = HexColor("#37474F")
GRAY_MID   = HexColor("#607D8B")
GRAY_LIGHT = HexColor("#ECEFF1")
TABLE_HEAD  = HexColor("#1565C0")
TABLE_ALT   = HexColor("#F5F8FF")

PAGE_W, PAGE_H = A4
MARGIN = 2.2 * cm

# === ESTILOS ===
def make_styles():
    base = getSampleStyleSheet()

    styles = {}

    styles['cover_title'] = ParagraphStyle(
        'cover_title', parent=base['Normal'],
        fontSize=32, leading=40, textColor=white,
        fontName='Helvetica-Bold', alignment=TA_CENTER, spaceAfter=8
    )
    styles['cover_sub'] = ParagraphStyle(
        'cover_sub', parent=base['Normal'],
        fontSize=14, leading=20, textColor=HexColor("#BBDEFB"),
        fontName='Helvetica', alignment=TA_CENTER, spaceAfter=6
    )
    styles['cover_version'] = ParagraphStyle(
        'cover_version', parent=base['Normal'],
        fontSize=11, textColor=HexColor("#90CAF9"),
        fontName='Helvetica', alignment=TA_CENTER
    )
    styles['h1'] = ParagraphStyle(
        'h1', parent=base['Normal'],
        fontSize=20, leading=26, textColor=NAVY,
        fontName='Helvetica-Bold', spaceBefore=14, spaceAfter=6,
        borderPad=4
    )
    styles['h2'] = ParagraphStyle(
        'h2', parent=base['Normal'],
        fontSize=14, leading=18, textColor=OCEAN,
        fontName='Helvetica-Bold', spaceBefore=12, spaceAfter=4
    )
    styles['h3'] = ParagraphStyle(
        'h3', parent=base['Normal'],
        fontSize=11, leading=15, textColor=GRAY_DARK,
        fontName='Helvetica-Bold', spaceBefore=8, spaceAfter=3
    )
    styles['body'] = ParagraphStyle(
        'body', parent=base['Normal'],
        fontSize=10, leading=15, textColor=GRAY_DARK,
        fontName='Helvetica', spaceBefore=2, spaceAfter=4,
        alignment=TA_JUSTIFY
    )
    styles['body_left'] = ParagraphStyle(
        'body_left', parent=styles['body'],
        alignment=TA_LEFT
    )
    styles['bullet'] = ParagraphStyle(
        'bullet', parent=base['Normal'],
        fontSize=10, leading=14, textColor=GRAY_DARK,
        fontName='Helvetica', spaceBefore=1, spaceAfter=1,
        leftIndent=14, bulletIndent=4
    )
    styles['warn_title'] = ParagraphStyle(
        'warn_title', parent=base['Normal'],
        fontSize=11, textColor=WARN_BORDER,
        fontName='Helvetica-Bold', spaceBefore=2, spaceAfter=2
    )
    styles['warn_body'] = ParagraphStyle(
        'warn_body', parent=base['Normal'],
        fontSize=10, leading=14, textColor=HexColor("#4A2800"),
        fontName='Helvetica', spaceBefore=0, spaceAfter=2
    )
    styles['danger_title'] = ParagraphStyle(
        'danger_title', parent=base['Normal'],
        fontSize=11, textColor=DANGER_BR,
        fontName='Helvetica-Bold', spaceBefore=2, spaceAfter=2
    )
    styles['danger_body'] = ParagraphStyle(
        'danger_body', parent=base['Normal'],
        fontSize=10, leading=14, textColor=HexColor("#4A0000"),
        fontName='Helvetica', spaceBefore=0, spaceAfter=2
    )
    styles['tip_title'] = ParagraphStyle(
        'tip_title', parent=base['Normal'],
        fontSize=11, textColor=TIP_BR,
        fontName='Helvetica-Bold', spaceBefore=2, spaceAfter=2
    )
    styles['tip_body'] = ParagraphStyle(
        'tip_body', parent=base['Normal'],
        fontSize=10, leading=14, textColor=HexColor("#1A3A1A"),
        fontName='Helvetica', spaceBefore=0, spaceAfter=2
    )
    styles['step_num'] = ParagraphStyle(
        'step_num', parent=base['Normal'],
        fontSize=13, textColor=white,
        fontName='Helvetica-Bold', alignment=TA_CENTER
    )
    styles['step_body'] = ParagraphStyle(
        'step_body', parent=base['Normal'],
        fontSize=10, leading=14, textColor=GRAY_DARK,
        fontName='Helvetica'
    )
    styles['toc_title'] = ParagraphStyle(
        'toc_title', parent=base['Normal'],
        fontSize=11, leading=16, textColor=OCEAN,
        fontName='Helvetica-Bold'
    )
    styles['toc_item'] = ParagraphStyle(
        'toc_item', parent=base['Normal'],
        fontSize=10, leading=15, textColor=GRAY_DARK,
        fontName='Helvetica', leftIndent=12
    )
    styles['code'] = ParagraphStyle(
        'code', parent=base['Normal'],
        fontSize=9, leading=13, textColor=HexColor("#1A237E"),
        fontName='Courier', backColor=HexColor("#F3F4F6"),
        borderPad=4, leftIndent=8
    )
    return styles

S = make_styles()

# ===================================================
#  HELPER FLOWABLES
# ===================================================

class SectionHeader(Flowable):
    """Encabezado de seccion con banda de color"""
    def __init__(self, number, title, width=None):
        super().__init__()
        self.number = number
        self.title  = title
        self.width  = width or (PAGE_W - 2*MARGIN)
        self.height = 36

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        # Fondo
        c.setFillColor(NAVY)
        c.roundRect(0, 0, w, h, 6, fill=1, stroke=0)
        # Numero
        c.setFillColor(ACCENT)
        c.circle(20, h/2, 13, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 13)
        c.drawCentredString(20, h/2 - 4.5, str(self.number))
        # Titulo
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 14)
        c.drawString(42, h/2 - 5, self.title)

    def wrap(self, *args):
        return self.width, self.height


class ColorBox(Flowable):
    """Caja de advertencia / consejo con borde de color"""
    def __init__(self, paragraphs, bg, border_color, width=None):
        super().__init__()
        self.paragraphs   = paragraphs
        self.bg           = bg
        self.border_color = border_color
        self.box_width    = width or (PAGE_W - 2*MARGIN)

    def wrap(self, availW, availH):
        self.box_width = availW
        # Calcular altura total del contenido
        pad = 10
        total = 2*pad
        for p in self.paragraphs:
            w, h = p.wrap(self.box_width - 2*pad - 6, availH)
            total += h + 3
        self._height = total
        return self.box_width, self._height

    def draw(self):
        c = self.canv
        w, h = self.box_width, self._height
        pad = 10
        # Fondo
        c.setFillColor(self.bg)
        c.setStrokeColor(self.border_color)
        c.setLineWidth(2)
        c.roundRect(0, 0, w, h, 6, fill=1, stroke=1)
        # Borde izquierdo grueso
        c.setFillColor(self.border_color)
        c.rect(0, 0, 5, h, fill=1, stroke=0)
        # Pintar parrafos de abajo a arriba
        y = h - pad
        for p in self.paragraphs:
            pw, ph = p.wrap(w - 2*pad - 6, 9999)
            y -= ph
            p.drawOn(c, pad + 6, y)
            y -= 3


class StepRow(Flowable):
    """Fila de paso numerado (circulo + texto)"""
    def __init__(self, number, text, width=None):
        super().__init__()
        self.number = number
        self.text   = text
        self._width = width or (PAGE_W - 2*MARGIN)
        self._para  = Paragraph(text, S['step_body'])

    def wrap(self, availW, availH):
        self._width = availW
        _, ph = self._para.wrap(self._width - 50, availH)
        self._height = max(28, ph + 10)
        return self._width, self._height

    def draw(self):
        c = self.canv
        cy = self._height / 2
        c.setFillColor(SKY)
        c.circle(14, cy, 12, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 10)
        c.drawCentredString(14, cy - 3.5, str(self.number))
        # Texto
        self._para.drawOn(c, 34, (self._height - self._para.height) / 2)


def spacer(h=6):
    return Spacer(1, h)

def hr(color=OCEAN):
    return HRFlowable(width="100%", thickness=1, color=color, spaceAfter=6, spaceBefore=4)

def h1(text):
    return Paragraph(text, S['h1'])

def h2(text):
    return Paragraph(text, S['h2'])

def h3(text):
    return Paragraph(text, S['h3'])

def body(text):
    return Paragraph(text, S['body'])

def body_l(text):
    return Paragraph(text, S['body_left'])

def bullet(items, indent=0):
    result = []
    for item in items:
        style = ParagraphStyle(
            'bullet_custom', parent=S['bullet'],
            leftIndent=14 + indent*10, bulletIndent=4 + indent*10
        )
        result.append(Paragraph(f"<bullet>&bull;</bullet> {item}", style))
    return result

def warn_box(title, lines):
    paras = [Paragraph(f"&#9888;  {title}", S['warn_title'])]
    for l in lines:
        paras.append(Paragraph(l, S['warn_body']))
    return ColorBox(paras, WARN_BG, WARN_BORDER)

def danger_box(title, lines):
    paras = [Paragraph(f"&#9888;  {title}", S['danger_title'])]
    for l in lines:
        paras.append(Paragraph(l, S['danger_body']))
    return ColorBox(paras, DANGER_BG, DANGER_BR)

def tip_box(title, lines):
    paras = [Paragraph(f"&#10003;  {title}", S['tip_title'])]
    for l in lines:
        paras.append(Paragraph(l, S['tip_body']))
    return ColorBox(paras, TIP_BG, TIP_BR)

def steps(*items):
    result = []
    for i, text in enumerate(items, 1):
        result.append(StepRow(i, text))
        result.append(spacer(3))
    return result

def data_table(headers, rows, col_widths=None):
    data = [headers] + rows
    w = PAGE_W - 2*MARGIN
    if col_widths is None:
        n = len(headers)
        col_widths = [w/n]*n
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ('BACKGROUND',  (0,0), (-1,0), TABLE_HEAD),
        ('TEXTCOLOR',   (0,0), (-1,0), white),
        ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',    (0,0), (-1,0), 9),
        ('ALIGN',       (0,0), (-1,0), 'CENTER'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, TABLE_ALT]),
        ('FONTNAME',    (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE',    (0,1), (-1,-1), 9),
        ('ALIGN',       (0,1), (0,-1), 'CENTER'),
        ('ALIGN',       (1,1), (-1,-1), 'LEFT'),
        ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
        ('GRID',        (0,0), (-1,-1), 0.4, HexColor("#BDBDBD")),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING',(0,0), (-1,-1), 6),
        ('TOPPADDING',  (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0),(-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, TABLE_ALT]),
    ]
    t.setStyle(TableStyle(style))
    return t


# ===================================================
#  PORTADA
# ===================================================
class CoverPage(Flowable):
    def __init__(self):
        super().__init__()
        self.width  = PAGE_W
        self.height = PAGE_H

    def wrap(self, *args):
        return self.width, self.height

    def draw(self):
        c = self.canv
        w, h = self.width, self.height

        # Fondo degradado simulado (rectángulos)
        c.setFillColor(NAVY)
        c.rect(0, 0, w, h, fill=1, stroke=0)

        c.setFillColor(HexColor("#112244"))
        c.rect(0, h*0.6, w, h*0.4, fill=1, stroke=0)

        # Ola decorativa
        from reportlab.graphics.shapes import Drawing, Path
        # Banda inferior
        c.setFillColor(OCEAN)
        c.rect(0, 0, w, h*0.22, fill=1, stroke=0)
        # Banda acento
        c.setFillColor(ACCENT)
        c.rect(0, 0, w, 8, fill=1, stroke=0)

        # Linea divisoria
        c.setStrokeColor(HexColor("#90CAF9"))
        c.setLineWidth(1)
        c.line(MARGIN, h*0.22 + 1, w-MARGIN, h*0.22 + 1)

        # Logo texto (ancla estilizada con texto)
        cy = h * 0.62
        # Circulo
        c.setFillColor(HexColor("#1565C0"))
        c.circle(w/2, cy, 55, fill=1, stroke=0)
        c.setStrokeColor(HexColor("#90CAF9"))
        c.setFillColor(white)
        c.setLineWidth(2)
        c.circle(w/2, cy, 53, fill=0, stroke=1)
        # Ancla simplificada
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 40)
        c.drawCentredString(w/2, cy - 14, "⚓")  # ancla unicode

        # Titulo
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 30)
        c.drawCentredString(w/2, h*0.46, "NauticAdmin")

        c.setFillColor(HexColor("#BBDEFB"))
        c.setFont('Helvetica', 14)
        c.drawCentredString(w/2, h*0.41, "Manual del Administrador")

        # Linea acento
        c.setFillColor(ACCENT)
        c.rect(w/2 - 40, h*0.395, 80, 3, fill=1, stroke=0)

        c.setFillColor(HexColor("#E3F2FD"))
        c.setFont('Helvetica', 11)
        c.drawCentredString(w/2, h*0.36, "Plataforma de gestion integral para nauticas")

        # Info inferior
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 10)
        c.drawCentredString(w/2, h*0.12, "Version 1.0 • Junio 2025")
        c.setFillColor(HexColor("#90CAF9"))
        c.setFont('Helvetica', 9)
        c.drawCentredString(w/2, h*0.08, "Confidencial • Solo para uso interno")

    def getSpaceBefore(self):
        return 0
    def getSpaceAfter(self):
        return 0

# ===================================================
#  HEADER / FOOTER
# ===================================================
def draw_cover(canvas, doc):
    """Dibuja la portada completa sobre la pagina 1."""
    canvas.saveState()
    w, h = PAGE_W, PAGE_H

    # Fondo base
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)

    canvas.setFillColor(HexColor("#112244"))
    canvas.rect(0, h*0.6, w, h*0.4, fill=1, stroke=0)

    # Banda inferior
    canvas.setFillColor(OCEAN)
    canvas.rect(0, 0, w, h*0.22, fill=1, stroke=0)
    # Banda acento
    canvas.setFillColor(ACCENT)
    canvas.rect(0, 0, w, 8, fill=1, stroke=0)

    # Linea divisoria
    canvas.setStrokeColor(HexColor("#90CAF9"))
    canvas.setLineWidth(1)
    canvas.line(MARGIN, h*0.22 + 1, w-MARGIN, h*0.22 + 1)

    # Circulo decorativo
    cy = h * 0.62
    canvas.setFillColor(HexColor("#1565C0"))
    canvas.circle(w/2, cy, 55, fill=1, stroke=0)
    canvas.setStrokeColor(HexColor("#90CAF9"))
    canvas.setLineWidth(2)
    canvas.circle(w/2, cy, 53, fill=0, stroke=1)

    # Texto ancla (emoji puede no rendir en todas las fuentes, usar texto)
    canvas.setFillColor(white)
    canvas.setFont('Helvetica-Bold', 26)
    canvas.drawCentredString(w/2, cy - 10, "NAUTIC")

    # Titulo
    canvas.setFillColor(white)
    canvas.setFont('Helvetica-Bold', 30)
    canvas.drawCentredString(w/2, h*0.46, "NauticAdmin")

    canvas.setFillColor(HexColor("#BBDEFB"))
    canvas.setFont('Helvetica', 14)
    canvas.drawCentredString(w/2, h*0.41, "Manual del Administrador")

    canvas.setFillColor(ACCENT)
    canvas.rect(w/2 - 40, h*0.395, 80, 3, fill=1, stroke=0)

    canvas.setFillColor(HexColor("#E3F2FD"))
    canvas.setFont('Helvetica', 11)
    canvas.drawCentredString(w/2, h*0.36, "Plataforma de gestion integral para nauticas")

    canvas.setFillColor(white)
    canvas.setFont('Helvetica-Bold', 10)
    canvas.drawCentredString(w/2, h*0.12, "Version 1.0  -  Junio 2025")
    canvas.setFillColor(HexColor("#90CAF9"))
    canvas.setFont('Helvetica', 9)
    canvas.drawCentredString(w/2, h*0.08, "Confidencial - Solo para uso interno")

    canvas.restoreState()


def on_page(canvas, doc):
    canvas.saveState()
    w = PAGE_W
    pn = doc.page

    if pn == 1:
        draw_cover(canvas, doc)
        canvas.restoreState()
        return

    # Header
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 1.5*cm, w, 1.5*cm, fill=1, stroke=0)
    canvas.setFillColor(white)
    canvas.setFont('Helvetica-Bold', 9)
    canvas.drawString(MARGIN, PAGE_H - 1*cm, "NauticAdmin")
    canvas.setFont('Helvetica', 9)
    canvas.drawRightString(w - MARGIN, PAGE_H - 1*cm, "Manual del Administrador")

    # Footer
    canvas.setFillColor(GRAY_LIGHT)
    canvas.rect(0, 0, w, 1.2*cm, fill=1, stroke=0)
    canvas.setStrokeColor(OCEAN)
    canvas.setLineWidth(0.5)
    canvas.line(0, 1.2*cm, w, 1.2*cm)
    canvas.setFillColor(GRAY_MID)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(MARGIN, 0.42*cm, "Documento confidencial - Solo para uso interno")
    canvas.drawRightString(w - MARGIN, 0.42*cm, f"Pagina {pn}")

    canvas.restoreState()

# ===================================================
#  CONTENIDO
# ===================================================
def build_content():
    story = []

    # --- PORTADA (dibujada en on_page para pagina 1) ---
    story.append(PageBreak())

    # --- INDICE ---
    story.append(Paragraph("Indice de Contenidos", S['h1']))
    story.append(hr())
    story.append(spacer(8))

    toc = [
        ("1.", "Introduccion al sistema", []),
        ("2.", "Acceso y roles de usuario", []),
        ("3.", "Panel de control (Dashboard)", []),
        ("4.", "Gestion de clientes", [
            "Alta y edicion de clientes",
            "Embarcaciones por cliente",
            "Importacion masiva",
            "Documentacion y archivos",
        ]),
        ("5.", "Cobros y pagos", [
            "Registrar un cobro manual",
            "Integracion con MercadoPago",
            "Gestion de morosos",
            "Archivos adjuntos en cobros",
        ]),
        ("6.", "FACTURACION ELECTRONICA (AFIP)", [
            "Configuracion inicial - LEER PRIMERO",
            "Primeros pasos: modo simulacion",
            "Facturar de a un cliente",
            "Avanzar a facturacion global",
        ]),
        ("7.", "Gastos y proveedores", []),
        ("8.", "Conciliacion de pagos", []),
        ("9.", "Solicitudes de embarcaciones", []),
        ("10.", "Fichas medicas", []),
        ("11.", "Turnos y asistencia", []),
        ("12.", "Mensajeria y WhatsApp", []),
        ("13.", "Soporte y configuracion", []),
    ]

    for num, title, subs in toc:
        story.append(Paragraph(
            f'<font color="#1565C0"><b>{num}</b></font>  {title}',
            S['toc_title']
        ))
        for sub in subs:
            story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;&#9642; {sub}", S['toc_item']))
        story.append(spacer(4))

    story.append(PageBreak())

    # ============================================================
    # SECCION 1 - INTRODUCCION
    # ============================================================
    story.append(SectionHeader(1, "Introduccion al Sistema"))
    story.append(spacer(10))

    story.append(body(
        "<b>NauticAdmin</b> es una plataforma de gestion integral diseñada especialmente para "
        "administradores de clubes nauticos. Permite gestionar clientes, embarcaciones, cobros, "
        "facturacion electronica (AFIP), gastos, conciliacion bancaria, solicitudes de uso de "
        "embarcaciones, fichas medicas, turnos y comunicaciones, todo desde un unico panel."
    ))
    story.append(spacer(6))

    story.append(h2("¿Que puede hacer con este sistema?"))
    story.append(spacer(4))
    story += bullet([
        "<b>Gestionar socios/clientes</b> con sus embarcaciones y datos personales",
        "<b>Registrar y controlar cobros</b> con integracion MercadoPago o en efectivo",
        "<b>Emitir facturas electronicas</b> AFIP directamente desde la plataforma",
        "<b>Administrar gastos y proveedores</b> con extraccion automatica de datos via IA",
        "<b>Conciliar pagos bancarios</b> contra el listado de socios",
        "<b>Gestionar solicitudes de uso de embarcaciones</b> en tiempo real",
        "<b>Controlar fichas medicas</b> de los socios con flujo de aprobacion",
        "<b>Enviar mensajes masivos</b> por email y WhatsApp",
    ])
    story.append(spacer(8))

    story.append(tip_box("Recomendacion inicial", [
        "Antes de comenzar a operar, complete la configuracion de su nautica en "
        "Gestionar Nautica &gt; datos generales, logo, y datos fiscales si va a emitir facturas."
    ]))
    story.append(PageBreak())

    # ============================================================
    # SECCION 2 - ACCESO Y ROLES
    # ============================================================
    story.append(SectionHeader(2, "Acceso y Roles de Usuario"))
    story.append(spacer(10))

    story.append(h2("Ingreso al sistema"))
    story += steps(
        "Abra su navegador e ingrese a la URL de la plataforma proporcionada por su administrador.",
        "Ingrese su email y contrasena registrados.",
        "Haga clic en <b>Iniciar sesion</b>. El sistema lo redirigira automaticamente a su panel segun su rol.",
    )
    story.append(spacer(10))

    story.append(h2("Roles disponibles"))
    story.append(spacer(4))

    headers = ["Rol", "Descripcion", "Accesos principales"]
    rows = [
        ["Administrador\nde Nautica", "Gestion completa de\nsu club", "Clientes, Cobros, Facturacion,\nGastos, Configuracion"],
        ["Operador", "Uso en el muelle /\natención diaria", "Clientes, Solicitudes de\nembarcaciones, Asistencia"],
        ["Editor", "Carga y edicion\nde datos", "Clientes, Fichas medicas,\nDocumentos"],
        ["Visualizador", "Solo lectura", "Reportes y listados"],
        ["Socio/Cliente", "Portal de autoservicio", "Su perfil, Pagos, Turnos"],
    ]
    story.append(data_table(
        [Paragraph(h, ParagraphStyle('th', parent=S['body'], textColor=white, fontName='Helvetica-Bold', fontSize=9)) for h in headers],
        [[Paragraph(str(c), S['body_left']) for c in row] for row in rows],
        col_widths=[3.5*cm, 4.5*cm, 9*cm]
    ))
    story.append(spacer(8))

    story.append(warn_box("Seguridad de acceso", [
        "Nunca comparta su contrasena. Cada operador debe tener su propio usuario.",
        "Si olvido su contrasena, contacte al super administrador para que la restablezca.",
        "Cierre sesion cuando termine de trabajar, especialmente en computadoras compartidas.",
    ]))
    story.append(PageBreak())

    # ============================================================
    # SECCION 3 - DASHBOARD
    # ============================================================
    story.append(SectionHeader(3, "Panel de Control (Dashboard)"))
    story.append(spacer(10))

    story.append(body(
        "Al iniciar sesion, el administrador ve el <b>Panel de Control principal</b> con un "
        "resumen del estado de su nautica: clientes activos, cobros del mes, "
        "alertas de morosos y accesos rapidos a las funciones mas usadas."
    ))
    story.append(spacer(8))

    story.append(h2("Elementos del panel"))
    story += bullet([
        "<b>Estadisticas rapidas:</b> Clientes activos, cobros ingresados, morosos, saldo del mes.",
        "<b>Actividad reciente:</b> Ultimos movimientos registrados en el sistema.",
        "<b>Accesos rapidos:</b> Botones directos a Nuevo Cliente, Registrar Cobro, Solicitudes.",
        "<b>Menu lateral:</b> Navegacion a todos los modulos del sistema.",
    ])
    story.append(spacer(8))

    story.append(h2("Menu lateral de navegacion"))
    story.append(spacer(4))

    nav_rows = [
        ["Clientes", "Gestion de socios y embarcaciones"],
        ["Cobros y Ventas", "Registro y control de pagos"],
        ["Gastos", "Facturas de proveedores y egresos"],
        ["Conciliacion", "Cruce de pagos con banco"],
        ["Solicitudes", "Embarcaciones solicitadas por socios"],
        ["Fichas Medicas", "Documentacion sanitaria"],
        ["Turnos", "Agenda de clases y actividades"],
        ["Mensajes", "Comunicaciones masivas"],
        ["Soporte", "Centro de tickets"],
        ["Gestionar Nautica", "Configuracion de la nautica"],
        ["Ajustes", "Preferencias del usuario"],
    ]
    story.append(data_table(
        [Paragraph(h, ParagraphStyle('th', parent=S['body'], textColor=white, fontName='Helvetica-Bold', fontSize=9)) for h in ["Opcion de menu", "Descripcion"]],
        [[Paragraph(str(c), S['body_left']) for c in row] for row in nav_rows],
        col_widths=[6*cm, 11*cm]
    ))
    story.append(PageBreak())

    # ============================================================
    # SECCION 4 - CLIENTES
    # ============================================================
    story.append(SectionHeader(4, "Gestion de Clientes"))
    story.append(spacer(10))

    story.append(h2("Alta de nuevo cliente"))
    story += steps(
        "Ir a <b>Clientes</b> en el menu lateral.",
        "Hacer clic en el boton <b>Nuevo Cliente</b> (esquina superior derecha).",
        "Completar los datos personales: Nombre, Apellido, DNI, Email, Telefono.",
        "Agregar las embarcaciones del socio (puede tener mas de una).",
        "Indicar los servicios contratados: lavado, marineria, kayaks, guarda embarcacion.",
        "Completar los datos fiscales si el cliente requiere factura: CUIT, condicion IVA.",
        "Guardar con el boton <b>Guardar Cliente</b>.",
    )
    story.append(spacer(8))

    story.append(h2("Datos de embarcaciones"))
    story += bullet([
        "<b>Nombre/Denominacion</b> de la embarcacion",
        "<b>Numero de matricula</b> o patente",
        "<b>Eslora, manga y calado</b> (dimensiones)",
        "<b>Clase de precio</b> asignada (vincula con el esquema de tarifas)",
    ])
    story.append(spacer(8))

    story.append(h2("Importacion masiva de clientes"))
    story.append(body(
        "Si viene de otro sistema, puede importar clientes desde un archivo Excel. "
        "Ir a <b>Gestionar Nautica &gt; Importar</b>."
    ))
    story.append(spacer(4))
    story += steps(
        "Descargar el modelo de planilla Excel desde el boton <b>Descargar plantilla</b>.",
        "Completar los datos en la planilla manteniendo el formato de columnas.",
        "Subir el archivo con el boton <b>Seleccionar archivo</b>.",
        "Revisar la previsualizacion y confirmar la importacion.",
        "El sistema mostrara un reporte de resultados indicando filas importadas y errores.",
    )
    story.append(spacer(8))

    story.append(h2("Busqueda y filtros"))
    story += bullet([
        "Use la barra de busqueda para encontrar clientes por nombre, DNI o email.",
        "Filtre por estado: Activo / Inactivo / Suspendido / Archivado.",
        "Filtre por servicio contratado para comunicaciones segmentadas.",
    ])
    story.append(spacer(8))

    story.append(h2("Acciones sobre un cliente"))
    story += bullet([
        "<b>Ver perfil completo:</b> Resumen, embarcaciones, cobros, documentos.",
        "<b>Editar datos:</b> Modificar cualquier campo del cliente.",
        "<b>Gestionar documentos:</b> Vincular links de Google Drive o adjuntar archivos.",
        "<b>Archivar:</b> Cuando un socio se da de baja (no se elimina, queda historico).",
        "<b>Personal autorizado:</b> Personas que pueden retirar embarcaciones en nombre del socio.",
    ])
    story.append(spacer(8))

    story.append(warn_box("Datos fiscales", [
        "Si el cliente solicita factura, es obligatorio completar su CUIT y condicion frente al IVA.",
        "Tambien marcar el campo <b>'Requiere factura'</b> en su perfil para que el sistema lo incluya "
        "en los procesos de facturacion automatica."
    ]))
    story.append(PageBreak())

    # ============================================================
    # SECCION 5 - COBROS
    # ============================================================
    story.append(SectionHeader(5, "Cobros y Pagos"))
    story.append(spacer(10))

    story.append(body(
        "El modulo de <b>Cobros y Ventas</b> centraliza todos los ingresos de la nautica. "
        "Cuenta con cinco pestanas principales:"
    ))
    story.append(spacer(6))

    pestanas = [
        ["Cobros Ingresados", "Listado de todos los pagos recibidos con estado y fecha"],
        ["Duplicados", "Pagos detectados como posibles duplicados para revision"],
        ["Cobros Rechazados", "Pagos que no pudieron asignarse automaticamente a un socio"],
        ["Morosos", "Socios con cuotas vencidas e impagas"],
        ["Configuracion", "Vinculacion con MercadoPago, cuentas bancarias"],
    ]
    story.append(data_table(
        [Paragraph(h, ParagraphStyle('th', parent=S['body'], textColor=white, fontName='Helvetica-Bold', fontSize=9)) for h in ["Pestana", "Descripcion"]],
        [[Paragraph(str(c), S['body_left']) for c in row] for row in pestanas],
        col_widths=[5.5*cm, 11.5*cm]
    ))
    story.append(spacer(10))

    story.append(h2("Registrar un cobro manual"))
    story.append(body("Use este flujo para cobros en efectivo, transferencia u otros medios no automatizados:"))
    story += steps(
        "Ir a <b>Cobros y Ventas</b>.",
        "Hacer clic en <b>Registrar Cobro</b>.",
        "Seleccionar el cliente de la lista.",
        "Indicar el concepto, importe, medio de pago y fecha.",
        "Opcionalmente adjuntar comprobante (foto o PDF).",
        "Confirmar. El cobro quedara registrado como aprobado.",
    )
    story.append(spacer(8))

    story.append(h2("Integracion MercadoPago"))
    story.append(body(
        "Para cobros online, la plataforma se integra con MercadoPago. "
        "El socio recibe un link de pago y, al abonar, el sistema registra "
        "el cobro automaticamente via webhook."
    ))
    story.append(spacer(4))
    story += steps(
        "Ir a <b>Cobros &gt; Configuracion</b>.",
        "Hacer clic en <b>Conectar con MercadoPago</b> y seguir el flujo OAuth.",
        "Una vez conectado, podra generar links de pago desde el perfil de cada cliente.",
        "Los pagos llegaran automaticamente sin intervencion manual.",
    )
    story.append(spacer(8))

    story.append(h2("Gestion de morosos"))
    story.append(body(
        "La pestana <b>Morosos</b> muestra todos los socios con cuotas vencidas "
        "organizados por antiguedad de deuda. Desde alli puede:"
    ))
    story += bullet([
        "Ver el detalle de cada deuda (conceptos y fechas).",
        "Enviar recordatorio de pago por email o WhatsApp.",
        "Registrar un cobro al momento de la gestion.",
        "Marcar al socio como suspendido si no regulariza.",
    ])
    story.append(spacer(8))

    story.append(h2("Adjuntos en cobros"))
    story.append(body(
        "Puede adjuntar comprobantes de pago (imagenes o PDF) a cualquier cobro. "
        "Esto es util para tener respaldo digital de transferencias, recibos de caja, etc."
    ))
    story.append(spacer(4))
    story += bullet([
        "Abra el cobro desde la lista.",
        "Use el boton <b>Adjuntar comprobante</b>.",
        "Seleccione el archivo desde su dispositivo (max. 10 MB).",
        "El archivo queda vinculado al cobro y puede descargarse en cualquier momento.",
    ])
    story.append(PageBreak())

    # ============================================================
    # SECCION 6 - FACTURACION (CRITICA)
    # ============================================================
    story.append(SectionHeader(6, "Facturacion Electronica AFIP"))
    story.append(spacer(10))

    story.append(danger_box(
        "IMPORTANTE - LEA ESTO ANTES DE FACTURAR",
        [
            "La facturacion electronica tiene impacto REAL en AFIP. "
            "Una vez emitida una factura, no puede eliminarse: solo puede anularse con una nota de credito.",
            "SIGA EL ORDEN de este capitulo: primero configurar, luego probar en simulacion "
            "(sin impacto real), luego facturar de a un cliente, y solo al final facturar en forma global.",
            "Cualquier duda antes de avanzar, consulte con su contador.",
        ]
    ))
    story.append(spacer(10))

    story.append(h2("6.1  Configuracion inicial (OBLIGATORIA)"))
    story.append(body("Antes de emitir cualquier factura, configure los datos fiscales de su nautica:"))
    story.append(spacer(4))
    story += steps(
        "Ir a <b>Gestionar Nautica &gt; Facturacion</b>.",
        "Completar: CUIT, Razon Social, condicion IVA, domicilio fiscal.",
        "Indicar el <b>Numero de Punto de Venta AFIP</b> asignado a esta plataforma.",
        "Seleccionar el tipo de comprobante: <b>Factura B</b> o <b>Factura C</b>.",
        "Completar email y telefono para mostrar en las facturas.",
        "Guardar los datos.",
    )
    story.append(spacer(8))

    story.append(warn_box("Punto de venta AFIP", [
        "El punto de venta debe estar habilitado en el portal de AFIP para el CUIT de la nautica.",
        "Notificas SRL opera con autoridad delegada. Si no tiene el punto de venta habilitado, "
        "consulte con el soporte de la plataforma antes de continuar."
    ]))
    story.append(spacer(10))

    story.append(h2("6.2  Modo simulacion (EMPEZAR AQUI)"))
    story.append(spacer(4))
    story.append(body(
        "El sistema cuenta con un <b>modo de prueba</b> que permite recorrer todo el flujo "
        "de facturacion sin enviar ningun comprobante real a AFIP. "
        "<b>Use este modo hasta estar completamente seguro del proceso.</b>"
    ))
    story.append(spacer(6))
    story += steps(
        "En la pantalla de Facturacion, verifique que el indicador muestre <b>'Modo Prueba'</b> "
        "o <b>'Homologacion'</b>.",
        "Genere una factura de prueba para un cliente de prueba.",
        "Verifique el PDF generado: datos del cliente, importes, neto, IVA, QR.",
        "Confirme que el numero de comprobante es de prueba (generalmente empieza en 0).",
        "Revise el PDF con su contador para validar que todos los datos son correctos.",
        "Recien cuando todo este validado, pase al modo produccion.",
    )
    story.append(spacer(8))

    story.append(tip_box("¿Cuantas pruebas hacer?", [
        "Recomendamos probar al menos 3 escenarios distintos en modo simulacion: "
        "un cliente con Factura B, un cliente con Factura C, y un cliente sin datos fiscales "
        "(para ver que el sistema lo detecta y alerta)."
    ]))
    story.append(spacer(10))

    story.append(h2("6.3  Primer facturacion real: de a UN cliente"))
    story.append(spacer(4))

    story.append(danger_box(
        "Paso obligatorio antes de facturacion global",
        [
            "NO emita facturas a todos los clientes en su primer uso real.",
            "Elija UN SOLO cliente de confianza para la primera factura real.",
            "Verifique que la factura se genero correctamente en AFIP antes de continuar.",
        ]
    ))
    story.append(spacer(6))

    story += steps(
        "Ir a <b>Clientes</b>, abrir el perfil del cliente elegido para la prueba.",
        "Verificar que tiene CUIT/DNI correcto, nombre, condicion IVA y que tiene el flag "
        "<b>'Requiere factura'</b> activado.",
        "Desde el perfil del cliente, ir a la seccion <b>Cobros</b>.",
        "Sobre un cobro ya registrado y aprobado, hacer clic en <b>Emitir Factura</b>.",
        "Revisar la previsualizacion: cliente, concepto, importe neto, IVA, total.",
        "Confirmar la emision. El sistema envia el comprobante a AFIP y genera el PDF.",
        "Descargar el PDF y verificar: numero de comprobante, QR funcional, todos los datos.",
        "Verificar en el portal de AFIP (con su CUIT) que el comprobante aparece registrado.",
        "Solo si todo es correcto, puede avanzar a facturar mas clientes.",
    )
    story.append(spacer(8))

    story.append(warn_box("¿Que hacer si algo sale mal?", [
        "Si la factura tiene un error de datos (nombre, importe, etc.): emita una Nota de Credito "
        "para anularla y luego emita la factura correcta.",
        "Si el sistema devuelve un error de AFIP: anote el codigo de error y consulte con soporte "
        "o su contador antes de reintentar.",
        "NUNCA intente emitir la misma factura dos veces sin anular la primera.",
    ]))
    story.append(PageBreak())

    story.append(h2("6.4  Facturacion de varios clientes"))
    story.append(spacer(4))
    story.append(body(
        "Una vez que verifico el proceso con al menos 3-5 clientes individuales y todo funciono "
        "correctamente, puede usar el proceso de facturacion para multiples clientes."
    ))
    story.append(spacer(6))

    story.append(warn_box("Antes de la facturacion masiva, verifique:", [
        "Todos los clientes a facturar tienen CUIT/DNI correcto y actualizado.",
        "Todos tienen la condicion IVA correcta (Responsable Inscripto, Consumidor Final, Monotributista).",
        "El importe de cada cobro es el correcto (no hay cobros duplicados o erroneos).",
        "Tiene acceso a internet estable durante todo el proceso (no interrumpir a mitad).",
    ]))
    story.append(spacer(8))

    story += steps(
        "Ir a <b>Cobros y Ventas</b>.",
        "Filtrar los cobros del periodo a facturar (mes y año).",
        "Usar la opcion <b>Facturacion</b> o <b>Emitir Facturas</b> del periodo.",
        "El sistema mostrara la lista de clientes elegibles con sus importes.",
        "Revisar la lista completa antes de confirmar. Desmarcar los que no deban facturarse.",
        "Confirmar la emision. El sistema procesara las facturas de a una y mostrara el progreso.",
        "Al finalizar, descargar el reporte de facturas emitidas y verificar contra AFIP.",
    )
    story.append(spacer(8))

    story.append(tip_box("Recomendacion para facturacion masiva", [
        "Haga la facturacion masiva en horarios de baja carga de AFIP (evitar los primeros dias "
        "del mes y los viernes por la tarde). AFIP puede estar lento o con errores en picos de uso.",
        "Conserve siempre el reporte de facturas emitidas como respaldo.",
    ]))
    story.append(spacer(8))

    story.append(h2("6.5  Notas de credito (anulacion de facturas)"))
    story.append(body(
        "Si necesita anular o corregir una factura ya emitida, debe emitir una "
        "<b>Nota de Credito</b> por el mismo importe."
    ))
    story.append(spacer(4))
    story += steps(
        "Ir al cobro o factura que desea anular.",
        "Hacer clic en <b>Emitir Nota de Credito</b>.",
        "Confirmar el motivo de la anulacion.",
        "El sistema emitira la nota de credito en AFIP y el comprobante original quedara neutralizado.",
        "Si corresponde, emita la factura correcta.",
    )
    story.append(PageBreak())

    # ============================================================
    # SECCION 7 - GASTOS
    # ============================================================
    story.append(SectionHeader(7, "Gastos y Proveedores"))
    story.append(spacer(10))

    story.append(body(
        "El modulo de <b>Gastos</b> permite registrar todas las facturas de compra y gastos "
        "de la nautica. Incluye extraccion inteligente de datos desde fotos de facturas."
    ))
    story.append(spacer(8))

    story.append(h2("Cargar una factura de proveedor"))
    story += steps(
        "Ir a <b>Gastos &gt; Cargar Factura</b>.",
        "Fotografiar o escanear la factura del proveedor.",
        "Subir la imagen. La IA extraera automaticamente: proveedor, concepto, importe, fecha, numero.",
        "Revisar y corregir si es necesario los datos extraidos.",
        "Confirmar la carga. El gasto queda en estado <b>Borrador</b>.",
        "Cuando se paga, marcarlo como <b>Pagado</b>.",
    )
    story.append(spacer(8))

    story.append(h2("Cuentas corrientes de proveedores"))
    story.append(body(
        "La pestana <b>Cuentas Corrientes</b> muestra el saldo pendiente con cada proveedor. "
        "Puede registrar pagos parciales y llevar el historial completo de cada proveedor."
    ))
    story.append(spacer(8))

    story.append(h2("Exportacion para IVA"))
    story.append(body(
        "Para facilitar la declaracion de IVA mensual, el sistema puede exportar un archivo "
        "con las facturas de compra y venta del periodo."
    ))
    story += bullet([
        "Ir a <b>Gastos &gt; Exportar IVA</b>.",
        "Seleccionar mes y año.",
        "Descargar en formato TXT o Excel segun lo requiera su contador.",
    ])
    story.append(PageBreak())

    # ============================================================
    # SECCION 8 - CONCILIACION
    # ============================================================
    story.append(SectionHeader(8, "Conciliacion de Pagos"))
    story.append(spacer(10))

    story.append(body(
        "La <b>Conciliacion</b> permite cruzar los pagos recibidos en el banco "
        "contra el listado de socios, identificando automaticamente quien pago y quien no."
    ))
    story.append(spacer(8))

    story.append(h2("Conciliacion desde extracto bancario"))
    story += steps(
        "Descargar el extracto bancario del periodo en formato Excel o CSV.",
        "Ir a <b>Conciliacion &gt; Formato Banco</b>.",
        "Subir el archivo de socios y el archivo de pagos bancarios.",
        "El sistema intentara emparejar automaticamente cada transferencia con un socio.",
        "Revisar los casos <b>REVISAR</b>: pagos que el sistema no pudo asignar con certeza.",
        "Para cada caso dudoso, confirmar o asignar manualmente el socio correcto.",
        "Los casos <b>NO COINCIDE</b> son transferencias sin socio identificado.",
        "Exportar el resultado de la conciliacion.",
    )
    story.append(spacer(8))

    story.append(h2("Gestion de alias"))
    story.append(body(
        "Si un socio transfiere desde una cuenta a nombre diferente al suyo "
        "(conyuge, empresa, etc.), puede guardar un <b>alias</b> para que el sistema "
        "lo reconozca automaticamente en el futuro."
    ))
    story.append(spacer(4))
    story += bullet([
        "En el caso sin coincidencia, asignar manualmente el socio.",
        "Al confirmar, el sistema preguntara si desea guardar el alias para futuras conciliaciones.",
        "Confirmar. El alias queda guardado y se aplica automaticamente la proxima vez.",
    ])
    story.append(PageBreak())

    # ============================================================
    # SECCION 9 - SOLICITUDES
    # ============================================================
    story.append(SectionHeader(9, "Solicitudes de Embarcaciones"))
    story.append(spacer(10))

    story.append(body(
        "Este modulo gestiona en tiempo real el retiro y devolucion de embarcaciones. "
        "Esta pensado para que los operadores en el muelle lo usen desde una tablet o celular."
    ))
    story.append(spacer(8))

    story.append(h2("Flujo de una solicitud"))
    story += steps(
        "El socio solicita su embarcacion (en persona o via link).",
        "El operador ve la solicitud en <b>Solicitudes &gt; Pendientes</b>.",
        "Hace clic en <b>Tomar solicitud</b>: registra quien retira la embarcacion y cuando.",
        "La solicitud pasa a <b>Entregadas</b>.",
        "Cuando el socio devuelve la embarcacion, el operador hace clic en <b>Marcar devolucion</b>.",
        "La solicitud pasa a <b>Devueltas</b> con hora de retorno registrada.",
    )
    story.append(spacer(8))

    story.append(h2("Registro historico"))
    story.append(body(
        "La pestana <b>Registro</b> guarda un historial completo de todos los movimientos. "
        "Puede filtrar por fecha, cliente o tipo de movimiento y ver estadisticas de uso."
    ))
    story.append(spacer(4))
    story += bullet([
        "Filtros rapidos: Hoy / Esta semana / Este mes.",
        "Busqueda por nombre de socio.",
        "Ranking de socios por cantidad de usos.",
        "Exportacion del registro para reportes.",
    ])
    story.append(PageBreak())

    # ============================================================
    # SECCION 10 - FICHAS MEDICAS
    # ============================================================
    story.append(SectionHeader(10, "Fichas Medicas"))
    story.append(spacer(10))

    story.append(body(
        "El modulo de <b>Fichas Medicas</b> gestiona la documentacion sanitaria obligatoria "
        "de los socios (apto medico, etc.). Los socios pueden subir sus propios documentos "
        "o el staff puede hacerlo en su nombre."
    ))
    story.append(spacer(8))

    story.append(h2("Revisar fichas pendientes"))
    story += steps(
        "Ir a <b>Fichas Medicas</b>.",
        "El panel muestra socios sin ficha y fichas pendientes de revision.",
        "Hacer clic en una ficha para ver el PDF en pantalla.",
        "Si el documento es valido: hacer clic en <b>Aprobar</b>.",
        "Si el documento tiene problemas: hacer clic en <b>Rechazar</b> e indicar el motivo.",
        "El sistema envia automaticamente un email al socio con el resultado.",
    )
    story.append(spacer(8))

    story.append(h2("Subir ficha en nombre de un socio"))
    story += bullet([
        "Ir al perfil del cliente.",
        "En la seccion <b>Ficha Medica</b>, hacer clic en <b>Subir documento</b>.",
        "Seleccionar el PDF. El documento queda disponible para revision.",
    ])
    story.append(PageBreak())

    # ============================================================
    # SECCION 11 - TURNOS Y ASISTENCIA
    # ============================================================
    story.append(SectionHeader(11, "Turnos y Asistencia"))
    story.append(spacer(10))

    story.append(h2("Configuracion de turnos (clases/actividades)"))
    story.append(body("Antes de que los socios puedan reservar turnos, configure los horarios disponibles:"))
    story += steps(
        "Ir a <b>Gestionar Nautica &gt; Turnos</b>.",
        "Definir los dias disponibles y los rangos horarios.",
        "Indicar la duracion de cada turno y el intervalo entre turnos.",
        "Configurar el cupo maximo por turno.",
        "Asignar el instructor o coach responsable.",
        "Guardar. Los socios veran estos horarios en su portal.",
    )
    story.append(spacer(8))

    story.append(h2("Control de asistencia"))
    story.append(body(
        "La <b>Asistencia</b> permite registrar quienes concurrieron a cada clase o actividad."
    ))
    story += steps(
        "Ir a <b>Asistencia</b>.",
        "Seleccionar la fecha y la actividad.",
        "Marcar a cada socio como Presente / Ausente / Justificado.",
        "Guardar el registro.",
    )
    story.append(PageBreak())

    # ============================================================
    # SECCION 12 - MENSAJERIA Y WHATSAPP
    # ============================================================
    story.append(SectionHeader(12, "Mensajeria y WhatsApp"))
    story.append(spacer(10))

    story.append(h2("Mensajes masivos por email"))
    story.append(body(
        "Desde <b>Mensajes</b> puede enviar comunicaciones a todos los socios "
        "o a grupos especificos (por categoria, servicio contratado, estado, etc.)."
    ))
    story += steps(
        "Ir a <b>Mensajes</b>.",
        "Redactar el asunto y el cuerpo del mensaje.",
        "Seleccionar el destinatario: Todos / Activos / Por categoria.",
        "Vista previa del mensaje.",
        "Enviar.",
    )
    story.append(spacer(8))

    story.append(h2("Integracion con WhatsApp (NotificasHub)"))
    story.append(body(
        "La plataforma se integra con <b>NotificasHub</b> para enviar notificaciones y "
        "recibir mensajes de WhatsApp de los socios."
    ))
    story += bullet([
        "Los socios pueden enviar comprobantes de pago por WhatsApp.",
        "Los mensajes de socios generan tickets de soporte automaticamente.",
        "Puede sincronizar los numeros de telefono de los socios al registrarlos.",
        "La sincronizacion requiere que la nautica tenga configurado NotificasHub.",
    ])
    story.append(spacer(6))

    story.append(warn_box("Configuracion de WhatsApp", [
        "Para activar la integracion con WhatsApp, la nautica debe tener contratado y configurado "
        "el servicio de NotificasHub. Si no esta configurado, la sincronizacion no estara disponible.",
        "Consulte con el soporte de NauticAdmin para activar esta funcionalidad."
    ]))
    story.append(PageBreak())

    # ============================================================
    # SECCION 13 - SOPORTE Y CONFIGURACION
    # ============================================================
    story.append(SectionHeader(13, "Soporte y Configuracion"))
    story.append(spacer(10))

    story.append(h2("Centro de soporte"))
    story.append(body(
        "El modulo de <b>Soporte</b> gestiona las consultas y problemas de los socios. "
        "Los tickets pueden generarse desde el portal de socios, por email o por WhatsApp."
    ))
    story += bullet([
        "Ver la cola de tickets abiertos.",
        "Responder o resolver tickets.",
        "Asignar prioridades.",
        "Ver el historial de tickets cerrados.",
    ])
    story.append(spacer(8))

    story.append(h2("Configuracion general de la nautica"))
    story.append(body(
        "Desde <b>Gestionar Nautica</b> puede configurar todos los aspectos de su club:"
    ))
    story.append(spacer(4))

    config_items = [
        ["Datos generales", "Nombre, ciudad, provincia, domicilio, logo de la nautica"],
        ["Usuarios", "Agregar y gestionar el personal con sus roles"],
        ["Precios", "Clases de precio para diferentes tipos de embarcaciones y servicios"],
        ["Importar", "Importacion masiva de clientes y pagos historicos"],
        ["Turnos", "Configuracion de horarios y cupos"],
        ["Facturacion", "Datos fiscales, punto de venta, tipo de comprobante"],
        ["Probar email", "Verificar que el envio de emails funciona correctamente"],
    ]
    story.append(data_table(
        [Paragraph(h, ParagraphStyle('th', parent=S['body'], textColor=white, fontName='Helvetica-Bold', fontSize=9)) for h in ["Seccion", "Descripcion"]],
        [[Paragraph(str(c), S['body_left']) for c in row] for row in config_items],
        col_widths=[4.5*cm, 12.5*cm]
    ))
    story.append(spacer(8))

    story.append(h2("Ajustes personales"))
    story += bullet([
        "<b>Tema visual:</b> Cambiar entre modo claro y oscuro.",
        "<b>Logo:</b> Cargar el logo de la nautica para que aparezca en el sistema.",
        "<b>Email de prueba:</b> Verificar la configuracion de correo saliente.",
    ])
    story.append(spacer(10))

    story.append(h2("¿Como pedir soporte tecnico?"))
    story.append(body(
        "Si tiene problemas con la plataforma, puede contactar al equipo de soporte "
        "a traves de los siguientes canales:"
    ))
    story.append(spacer(4))
    story += bullet([
        "Desde el sistema: Soporte &gt; Nuevo Ticket.",
        "Por email al soporte de NauticAdmin.",
        "Por WhatsApp si tiene habilitado el canal.",
    ])
    story.append(spacer(8))

    story.append(tip_box("Antes de contactar soporte", [
        "Incluya siempre: una descripcion del problema, los pasos que realizo, "
        "un screenshot si es posible, y el nombre de su nautica. "
        "Esto acelera significativamente la resolucion."
    ]))
    story.append(spacer(10))
    story.append(hr())
    story.append(spacer(8))

    # Cierre
    story.append(Paragraph(
        "Manual del Administrador - NauticAdmin v1.0 - Junio 2025",
        ParagraphStyle('footer_doc', parent=S['body'], alignment=TA_CENTER, textColor=GRAY_MID, fontSize=9)
    ))
    story.append(Paragraph(
        "Documento confidencial. Uso interno exclusivo.",
        ParagraphStyle('footer_doc2', parent=S['body'], alignment=TA_CENTER, textColor=GRAY_MID, fontSize=8)
    ))

    return story


# ===================================================
#  MAIN
# ===================================================
def main():
    output = "C:/DEV/nauticadmin/Manual_Administrador_NauticAdmin.pdf"
    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=2.0*cm,
        bottomMargin=2.0*cm,
        title="Manual del Administrador - NauticAdmin",
        author="NauticAdmin",
        subject="Manual de uso para administradores de nautica",
    )

    story = build_content()
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"PDF generado: {output}")

if __name__ == "__main__":
    main()

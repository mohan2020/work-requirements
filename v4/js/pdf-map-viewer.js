/**
 * Interactive PDF viewer for the mapping wizard — PDF.js render + clickable field hotspots.
 */
const PDFMapViewer = (() => {
  let pdfjsLib = null;
  const RENDER_SCALE = 1.25;
  let onSelectHandler = null;
  let onPlaceCustomHandler = null;
  let onRectChangeHandler = null;
  let drawState = null;
  let dragState = null;

  async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;
    if (window.pdfjsLib) {
      pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      return pdfjsLib;
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => {
        pdfjsLib = window.pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(pdfjsLib);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function extractFieldWidgets(bytes) {
    const { PDFDocument } = await loadPdfLibForMapper();
    const pdfDoc = await PDFDocument.load(bytes);
    const form = pdfDoc.getForm();
    const pages = pdfDoc.getPages();
    const byName = new Map();
    const pageHeights = pages.map((p) => p.getHeight());

    form.getFields().forEach((field) => {
      const name = field.getName();
      const type = field.constructor.name.replace('PDF', '');
      field.acroField.getWidgets().forEach((widget) => {
        const rect = widget.getRectangle();
        const pageRef = widget.P();
        let pageIndex = 0;
        if (pageRef) {
          const idx = pages.findIndex((p) => p.ref.toString() === pageRef.toString());
          if (idx >= 0) pageIndex = idx;
        }
        const pageHeight = pages[pageIndex].getHeight();
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push({ name, type, pageIndex, rect, pageHeight });
      });
    });

    byName.pageHeights = pageHeights;
    return byName;
  }

  function rectToCss(rect, pageHeight, scale) {
    return {
      left: `${rect.x * scale}px`,
      top: `${(pageHeight - rect.y - rect.height) * scale}px`,
      width: `${rect.width * scale}px`,
      height: `${rect.height * scale}px`,
    };
  }

  function cssToPdfRect(left, top, width, height, pageHeight, scale) {
    return {
      x: left / scale,
      y: pageHeight - (top / scale) - (height / scale),
      width: width / scale,
      height: height / scale,
    };
  }

  function getPreviewText(mapping) {
    if (typeof resolveMappingPreviewValue === 'function') {
      return resolveMappingPreviewValue(mapping);
    }
    if (!mapping || mapping.source === 'skip') return '';
    if (mapping.source === 'ehr' && mapping.ehrFieldId) {
      return resolveEhrSampleValue(mapping.ehrFieldId) || '';
    }
    if (mapping.source === 'manual') return mapping.manualLabel || 'Manual entry';
    return '';
  }

  function hotspotStatus(mapping) {
    if (!mapping) return 'unmapped';
    if (mapping.source === 'skip') return 'skip';
    if (mapping.source === 'ehr' || mapping.source === 'manual') return 'mapped';
    return 'unmapped';
  }

  function buildHotspotEl(mapping, idx, widget, scale, selectedIdx, layer) {
    const pageHeight = widget.pageHeight || mapping.pageHeight || 792;
    const rect = widget.rect || mapping.rect;
    const css = rectToCss(rect, pageHeight, scale);
    const status = hotspotStatus(mapping);
    const preview = getPreviewText(mapping);
    const isActive = selectedIdx === idx;
    const isCheck = mapping.fieldType === 'checkbox' || mapping?.pdfType === 'CheckBox' || widget.type === 'CheckBox';

    const el = document.createElement('button');
    el.type = 'button';
    const classes = ['pdf-hotspot', status, isActive ? 'active' : ''];
    if (mapping.isCustom) classes.push('custom');
    if (mapping.fieldType === 'textarea') classes.push('textarea-field');
    el.className = classes.filter(Boolean).join(' ');
    el.dataset.idx = String(idx);
    el.dataset.field = mapping?.pdfField || widget.name;
    el.title = mapping?.pdfField || widget.name;
    Object.assign(el.style, css);

    if (mapping.isCustom && status !== 'skip') {
      const badge = document.createElement('span');
      badge.className = 'pdf-hotspot-type';
      badge.textContent = (mapping.fieldType || 'text').toUpperCase();
      el.appendChild(badge);

      const grip = document.createElement('span');
      grip.className = 'pdf-hotspot-grip';
      grip.title = 'Drag to move';
      grip.setAttribute('aria-hidden', 'true');
      grip.textContent = '⋮⋮';
      grip.addEventListener('mousedown', (e) => startCustomDrag(e, el, idx, layer, pageHeight, 'move'));
      el.appendChild(grip);

      if (isActive) {
        const resize = document.createElement('span');
        resize.className = 'pdf-hotspot-resize';
        resize.title = 'Drag to resize';
        resize.addEventListener('mousedown', (e) => startCustomDrag(e, el, idx, layer, pageHeight, 'resize'));
        el.appendChild(resize);
      }
    }

    if (status === 'mapped') {
      if (isCheck) {
        const val = document.createElement('span');
        val.className = 'pdf-hotspot-value check';
        val.textContent = '✓';
        el.appendChild(val);
      } else if (preview) {
        const val = document.createElement('span');
        val.className = 'pdf-hotspot-value';
        const fmt = typeof resolveFieldFormat === 'function' ? resolveFieldFormat(mapping) : { fontSize: 8, textAlign: 'left' };
        const isTextarea = mapping.fieldType === 'textarea';
        val.style.fontSize = `${Math.max(6, fmt.fontSize * scale * 0.95)}px`;
        val.style.textAlign = fmt.textAlign;
        if (isTextarea) {
          val.textContent = preview;
          val.style.whiteSpace = 'normal';
          val.style.display = '-webkit-box';
          val.style.webkitLineClamp = String(Math.max(2, Math.floor((rect.height * scale) / (fmt.fontSize * scale * 1.3))));
          val.style.webkitBoxOrient = 'vertical';
          val.style.overflow = 'hidden';
        } else {
          val.textContent = preview.length > 80 ? `${preview.slice(0, 78)}…` : preview;
        }
        el.appendChild(val);
      }
    } else if (status === 'unmapped') {
      const hint = document.createElement('span');
      hint.className = 'pdf-hotspot-hint';
      const name = mapping?.pdfField || widget.name || '';
      hint.textContent = name.length > 22 ? `${name.slice(0, 20)}…` : name;
      el.appendChild(hint);
    }

    el.addEventListener('click', (e) => {
      if (e.target.closest('.pdf-hotspot-grip') || e.target.closest('.pdf-hotspot-resize')) return;
      if (dragState?.didDrag) return;
      e.preventDefault();
      e.stopPropagation();
      if (onSelectHandler) onSelectHandler(idx, { fromPdf: true });
    });

    return el;
  }

  function getElPdfRect(el, pageHeight, scale) {
    const left = parseFloat(el.style.left);
    const top = parseFloat(el.style.top);
    const width = parseFloat(el.style.width);
    const height = parseFloat(el.style.height);
    return cssToPdfRect(left, top, width, height, pageHeight, scale);
  }

  function applyElPdfRect(el, rect, pageHeight, scale) {
    Object.assign(el.style, rectToCss(rect, pageHeight, scale));
  }

  function startCustomDrag(e, el, idx, layer, pageHeight, mode) {
    e.preventDefault();
    e.stopPropagation();
    const scale = RENDER_SCALE;
    const startMouse = { x: e.clientX, y: e.clientY };
    const startRect = getElPdfRect(el, pageHeight, scale);
    dragState = { didDrag: false };

    const onMove = (ev) => {
      const dx = (ev.clientX - startMouse.x) / scale;
      const dyScreen = (ev.clientY - startMouse.y) / scale;
      if (Math.abs(ev.clientX - startMouse.x) > 3 || Math.abs(ev.clientY - startMouse.y) > 3) {
        dragState.didDrag = true;
      }

      let next = { ...startRect };
      if (mode === 'move') {
        next.x = startRect.x + dx;
        next.y = startRect.y - dyScreen;
      } else {
        next.width = Math.max(8, startRect.width + dx);
        next.height = Math.max(8, startRect.height - dyScreen);
      }
      applyElPdfRect(el, next, pageHeight, scale);
      if (onRectChangeHandler) onRectChangeHandler(idx, next, { live: true });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const finalRect = getElPdfRect(el, pageHeight, scale);
      if (onRectChangeHandler) onRectChangeHandler(idx, finalRect, { live: false });
      setTimeout(() => { dragState = null; }, 0);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function getWidgetForMapping(mapping, widgetsByName) {
    if (mapping.isCustom && mapping.rect) {
      return [{
        name: mapping.pdfField,
        type: mapping.pdfType,
        pageIndex: mapping.pageIndex,
        rect: mapping.rect,
        pageHeight: mapping.pageHeight || 792,
      }];
    }
    return widgetsByName.get(mapping.pdfField) || [];
  }

  function updateHotspots(host, mappings, widgetsByName, selectedIdx, onSelect, onRectChange) {
    if (!host) return;
    onSelectHandler = onSelect;
    onRectChangeHandler = onRectChange;
    const layers = host.querySelectorAll('.pdf-hotspot-layer');
    layers.forEach((layer) => { layer.innerHTML = ''; });

    mappings.forEach((mapping, idx) => {
      const widgets = getWidgetForMapping(mapping, widgetsByName);
      widgets.forEach((widget) => {
        const layer = host.querySelector(`.pdf-hotspot-layer[data-page="${widget.pageIndex}"]`);
        if (!layer) return;
        layer.appendChild(buildHotspotEl(mapping, idx, widget, RENDER_SCALE, selectedIdx, layer));
      });
    });
  }

  function scrollToField(host, mappings, fieldName) {
    if (!host || !fieldName) return;
    const idx = mappings.findIndex((m) => m.pdfField === fieldName);
    if (idx < 0) return;
    const hotspot = host.querySelector(`.pdf-hotspot[data-idx="${idx}"]`);
    hotspot?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function bindDrawMode(host, enabled, onPlace) {
    onPlaceCustomHandler = onPlace;
    drawState = null;
    host?.querySelectorAll('.pdf-hotspot-layer').forEach((layer) => {
      layer.classList.toggle('draw-mode', !!enabled);
      if (enabled) bindLayerDrawEvents(layer);
    });
  }

  function bindLayerDrawEvents(layer) {
    if (layer.dataset.drawBound) return;
    layer.dataset.drawBound = '1';

    layer.addEventListener('mousedown', (e) => {
      if (!layer.classList.contains('draw-mode')) return;
      if (e.target.closest('.pdf-hotspot')) return;
      e.preventDefault();
      const box = layer.getBoundingClientRect();
      const startX = e.clientX - box.left;
      const startY = e.clientY - box.top;
      drawState = { layer, startX, startY, pageIndex: +layer.dataset.page, pageHeight: +layer.dataset.pageHeight };
      removeDrawPreview(layer);
      const preview = document.createElement('div');
      preview.className = 'pdf-draw-preview';
      preview.style.left = `${startX}px`;
      preview.style.top = `${startY}px`;
      layer.appendChild(preview);
      drawState.preview = preview;
    });

    layer.addEventListener('mousemove', (e) => {
      if (!drawState || drawState.layer !== layer || !drawState.preview) return;
      const box = layer.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      const left = Math.min(drawState.startX, x);
      const top = Math.min(drawState.startY, y);
      const width = Math.abs(x - drawState.startX);
      const height = Math.abs(y - drawState.startY);
      Object.assign(drawState.preview.style, {
        left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
      });
    });

    layer.addEventListener('mouseup', (e) => {
      if (!drawState || drawState.layer !== layer) return;
      const box = layer.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      const left = Math.min(drawState.startX, x);
      const top = Math.min(drawState.startY, y);
      const width = Math.max(Math.abs(x - drawState.startX), 8);
      const height = Math.max(Math.abs(y - drawState.startY), 8);
      const rect = cssToPdfRect(left, top, width, height, drawState.pageHeight, RENDER_SCALE);
      removeDrawPreview(layer);
      const payload = {
        pageIndex: drawState.pageIndex,
        pageHeight: drawState.pageHeight,
        rect,
      };
      drawState = null;
      if (onPlaceCustomHandler) onPlaceCustomHandler(payload);
    });
  }

  function removeDrawPreview(layer) {
    layer.querySelectorAll('.pdf-draw-preview').forEach((el) => el.remove());
  }

  async function mountPages(host, bytes, options = {}) {
    const result = await mountPagesAtScale(host, bytes, options.scale ?? RENDER_SCALE);
    return result;
  }

  /** Render PDF pages; optionally fit to host width. Returns { scale, pageHeights }. */
  async function mountPagesAtScale(host, bytes, scaleOrFit = RENDER_SCALE) {
    if (!host) return { scale: RENDER_SCALE, pageHeights: [] };
    host.innerHTML = '<div class="pdf-pages-scroll"><p class="pdf-loading">Rendering PDF…</p></div>';
    const scroll = host.querySelector('.pdf-pages-scroll');
    scroll.innerHTML = '';

    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: bytes.slice(0) }).promise;
    const pageHeights = [];

    let scale = typeof scaleOrFit === 'number' ? scaleOrFit : RENDER_SCALE;
    if (scaleOrFit === 'fit-width') {
      const page1 = await doc.getPage(1);
      const base1 = page1.getViewport({ scale: 1 });
      const available = Math.max(280, (host.clientWidth || host.offsetWidth || 560) - 24);
      scale = Math.min(RENDER_SCALE, available / base1.width);
      scale = Math.max(0.45, scale);
    }

    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const baseViewport = page.getViewport({ scale: 1 });
      const pdfPageHeight = baseViewport.height;
      pageHeights.push(pdfPageHeight);

      const wrap = document.createElement('div');
      wrap.className = 'pdf-page-wrap';
      wrap.style.width = `${viewport.width}px`;

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.className = 'pdf-page-canvas';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      const overlay = document.createElement('div');
      overlay.className = 'pdf-hotspot-layer official-form-layer';
      overlay.dataset.page = String(i - 1);
      overlay.style.width = `${viewport.width}px`;
      overlay.style.height = `${viewport.height}px`;
      overlay.dataset.pageHeight = String(pdfPageHeight);
      overlay.dataset.scale = String(scale);

      wrap.appendChild(canvas);
      wrap.appendChild(overlay);
      scroll.appendChild(wrap);
    }

    return { scale, pageHeights };
  }

  async function mount(host, bytes, mappings, widgetsByName, selectedIdx, onSelect, onRectChange) {
    if (!host) return;
    host.innerHTML = '<div class="pdf-pages-scroll"><p class="pdf-loading">Rendering PDF…</p></div>';
    const scroll = host.querySelector('.pdf-pages-scroll');
    scroll.innerHTML = '';

    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: bytes.slice(0) }).promise;

    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const baseViewport = page.getViewport({ scale: 1 });
      const pdfPageHeight = baseViewport.height;

      const wrap = document.createElement('div');
      wrap.className = 'pdf-page-wrap';

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.className = 'pdf-page-canvas';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      const overlay = document.createElement('div');
      overlay.className = 'pdf-hotspot-layer';
      overlay.dataset.page = String(i - 1);
      overlay.style.width = `${viewport.width}px`;
      overlay.style.height = `${viewport.height}px`;
      overlay.dataset.pageHeight = String(pdfPageHeight);

      wrap.appendChild(canvas);
      wrap.appendChild(overlay);
      scroll.appendChild(wrap);
    }

    updateHotspots(host, mappings, widgetsByName, selectedIdx, onSelect, onRectChange);
  }

  function destroy(host) {
    if (host) host.innerHTML = '';
    onSelectHandler = null;
    onPlaceCustomHandler = null;
    drawState = null;
  }

  return {
    mount,
    mountPages,
    mountPagesAtScale,
    updateHotspots,
    scrollToField,
    extractFieldWidgets,
    bindDrawMode,
    destroy,
    rectToCss,
    RENDER_SCALE,
  };
})();

window.PDFMapViewer = PDFMapViewer;

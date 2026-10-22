import React, { useState, useRef, useMemo } from 'react';
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  ArrowLeft,
  Settings,
  RefreshCw,
  FileSpreadsheet,
  AlertTriangle,
  HelpCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ImportDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

interface TargetField {
  key: string;
  label: string;
  required: boolean;
  description: string;
  aliases: string[];
}

const TARGET_FIELDS: TargetField[] = [
  { key: 'codigo', label: 'Código de Dispositivo', required: true, description: 'Identificador único (ej: AP-WIFI-01, CAM-01)', aliases: ['codigo', 'código', 'id', 'name', 'nombre', 'device_code', 'tag'] },
  { key: 'tipo', label: 'Tipo de Dispositivo', required: true, description: "'camara', 'wifi_ap', 'datos_funcionario' o 'datos_alumno'", aliases: ['tipo', 'type', 'tipo_dispositivo', 'device_type', 'categoria', 'tipo_punto'] },
  { key: 'mac', label: 'Dirección MAC', required: false, description: 'Formato AA:BB:CC:DD:EE:FF', aliases: ['mac', 'direccion_mac', 'dirección_mac', 'mac_address'] },
  { key: 'ip', label: 'Dirección IP', required: false, description: 'IPv4 asignada (ej: 192.168.1.50)', aliases: ['ip', 'direccion_ip', 'dirección_ip', 'ip_address'] },
  { key: 'marca', label: 'Marca / Fabricante', required: false, description: 'Ej: Cisco, Ubiquiti, Hikvision, Dahua', aliases: ['marca', 'brand', 'fabricante', 'vendor'] },
  { key: 'modelo', label: 'Modelo', required: false, description: 'Modelo comercial del equipo', aliases: ['modelo', 'model'] },
  { key: 'ubicacion', label: 'Ubicación Específica', required: false, description: 'Piso, aula, pasillo o referencia física', aliases: ['ubicacion', 'ubicación', 'location', 'ubicacion_especifica', 'lugar'] }
];

interface RawRowData {
  [header: string]: string;
}

interface ProcessedRow {
  index: number;
  codigo: string;
  tipo: string;
  mac: string;
  ip: string;
  marca: string;
  modelo: string;
  ubicacion: string;
  isValid: boolean;
  errors: string[];
}

interface SimulationResult {
  total: number;
  successCount: number;
  errorCount: number;
  errorsList: { row: number; codigo: string; motivo: string; raw: any }[];
}

export const ImportDevicesModal: React.FC<ImportDevicesModalProps> = ({
  isOpen,
  onClose,
  onRefresh
}) => {
  const [step, setStep] = useState<number>(1);
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRowData[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state to initial
  const resetWorkflow = () => {
    setStep(1);
    setFile(null);
    setCsvHeaders([]);
    setRawRows([]);
    setFieldMapping({});
    setSimulationResult(null);
    setIsProcessing(false);
    setFileError(null);
  };

  const handleClose = () => {
    resetWorkflow();
    onClose();
  };

  // Step 1: Download CSV Template
  const handleDownloadTemplate = () => {
    const headers = 'codigo,tipo,mac,ip,marca,modelo,ubicacion';
    const sampleRows = [
      'AP-WIFI-SALA101,wifi_ap,00:11:22:33:44:55,192.168.10.15,Ubiquiti,UniFi 6 Pro,Sala 101 Piso 1',
      'CAM-PASILLO-02,camara,00:22:33:44:55:66,192.168.20.40,Hikvision,DS-2CD2143G2-I,Pasillo Central Norte',
      'PR-DOCENTE-05,datos_funcionario,00:33:44:55:66:77,192.168.10.22,Cisco,Catalyst 9115,Sala de Profesores',
      'PR-ALUMNO-12,datos_alumno,00:44:55:66:77:88,192.168.30.12,HP,Aruba AP22,Laboratorio 2'
    ].join('\n');

    const csvContent = `${headers}\n${sampleRows}\n`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla_importacion_dispositivos.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Parse CSV text into headers and raw rows
  const parseCSVText = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) return { headers: [], rows: [] };

    // Simple CSV parser handling comma or semicolon delimiters
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let insideQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          insideQuotes = !insideQuotes;
        } else if (char === delimiter && !insideQuotes) {
          result.push(cur.trim().replace(/^["']|["']$/g, ''));
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim().replace(/^["']|["']$/g, ''));
      return result;
    };

    const headers = parseLine(lines[0]);
    const rows: RawRowData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.every(v => v === '')) continue;
      const rowObj: RawRowData = {};
      headers.forEach((h, idx) => {
        rowObj[h] = values[idx] || '';
      });
      rows.push(rowObj);
    }

    return { headers, rows };
  };

  const handleFileProcess = (selectedFile: File) => {
    setFileError(null);
    if (!selectedFile.name.toLowerCase().endsWith('.csv') && !selectedFile.type.includes('csv')) {
      setFileError('Por favor selecciona un archivo con formato .csv');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        setFileError('El archivo CSV está vacío.');
        return;
      }

      const { headers, rows } = parseCSVText(content);
      if (headers.length === 0 || rows.length === 0) {
        setFileError('El archivo CSV no contiene registros o encabezados válidos.');
        return;
      }

      setCsvHeaders(headers);
      setRawRows(rows);

      // Auto-match headers to target fields based on aliases
      const initialMapping: Record<string, string> = {};
      TARGET_FIELDS.forEach(tf => {
        const matchedHeader = headers.find(h => {
          const cleanH = h.toLowerCase().trim().replace(/[-_ ]/g, '');
          return tf.aliases.some(alias => cleanH === alias.toLowerCase().replace(/[-_ ]/g, ''));
        });
        if (matchedHeader) {
          initialMapping[tf.key] = matchedHeader;
        }
      });

      setFieldMapping(initialMapping);
      setStep(2);
    };

    reader.readAsText(selectedFile, 'UTF-8');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // Step 2: Validate mapping
  const isRequiredMappingComplete = Boolean(
    fieldMapping['codigo'] && fieldMapping['tipo']
  );

  // Step 3: Process rows according to mapping
  const processedRows: ProcessedRow[] = useMemo(() => {
    if (step < 3) return [];

    return rawRows.map((raw, idx) => {
      const codigo = (fieldMapping['codigo'] ? raw[fieldMapping['codigo']] : '').trim();
      const rawTipo = (fieldMapping['tipo'] ? raw[fieldMapping['tipo']] : '').trim().toLowerCase();
      const mac = (fieldMapping['mac'] ? raw[fieldMapping['mac']] : '').trim();
      const ip = (fieldMapping['ip'] ? raw[fieldMapping['ip']] : '').trim();
      const marca = (fieldMapping['marca'] ? raw[fieldMapping['marca']] : '').trim();
      const modelo = (fieldMapping['modelo'] ? raw[fieldMapping['modelo']] : '').trim();
      const ubicacion = (fieldMapping['ubicacion'] ? raw[fieldMapping['ubicacion']] : '').trim();

      const errors: string[] = [];

      // Validations
      if (!codigo) {
        errors.push('El código es obligatorio');
      }

      let normalizedTipo = rawTipo;
      if (rawTipo.includes('camara') || rawTipo.includes('cámara') || rawTipo.includes('cctv') || rawTipo === 'cam') {
        normalizedTipo = 'camara';
      } else if (rawTipo.includes('wifi_ap') || rawTipo.includes('wifi') || rawTipo.includes('access_point') || rawTipo === 'ap' || rawTipo === 'punto_red' || rawTipo === 'punto') {
        normalizedTipo = 'wifi_ap';
      } else if (rawTipo.includes('funcionario') || rawTipo.includes('datos_funcionario') || rawTipo.includes('docente') || rawTipo.includes('admin')) {
        normalizedTipo = 'datos_funcionario';
      } else if (rawTipo.includes('alumno') || rawTipo.includes('datos_alumno') || rawTipo.includes('estudiante') || rawTipo.includes('laboratorio')) {
        normalizedTipo = 'datos_alumno';
      } else if (!rawTipo) {
        errors.push('El tipo es obligatorio');
      } else {
        errors.push(`Tipo desconocido: "${rawTipo}". Valores permitidos: 'camara', 'wifi_ap', 'datos_funcionario' o 'datos_alumno'`);
      }

      // Optional MAC format check
      if (mac && !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) {
        errors.push('Formato de MAC inválido');
      }

      // Optional IP format check
      if (ip && !/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip)) {
        errors.push('Formato de IP IPv4 inválido');
      }

      return {
        index: idx + 1,
        codigo,
        tipo: normalizedTipo,
        mac,
        ip,
        marca,
        modelo,
        ubicacion,
        isValid: errors.length === 0,
        errors
      };
    });
  }, [rawRows, fieldMapping, step]);

  const totalProcessed = processedRows.length;
  const invalidRowsCount = processedRows.filter(r => !r.isValid).length;
  const validRowsCount = totalProcessed - invalidRowsCount;

  // Step 3 to Step 4: Real Supabase Import
  const handleStartImport = async () => {
    setIsProcessing(true);

    const errorsList: { row: number; codigo: string; motivo: string; raw: any }[] = [];
    let successCount = 0;

    // 1. Recoger filas que no pasaron la validación previa en cliente
    processedRows.forEach(r => {
      if (!r.isValid) {
        errorsList.push({
          row: r.index,
          codigo: r.codigo || 'SIN-CODIGO',
          motivo: r.errors.join('; '),
          raw: r
        });
      }
    });

    // 2. Tomar únicamente registros válidos
    const validRows = processedRows.filter(r => r.isValid);

    // 3. Separar en dos grupos según tipo
    const camarasToInsert: ProcessedRow[] = [];
    const puntosToInsert: ProcessedRow[] = [];

    validRows.forEach(r => {
      const lowerTipo = r.tipo.toLowerCase();
      if (lowerTipo.includes('camara')) {
        camarasToInsert.push(r);
      } else if (
        lowerTipo.includes('wifi_ap') ||
        lowerTipo.includes('datos_funcionario') ||
        lowerTipo.includes('datos_alumno') ||
        lowerTipo.includes('punto_red')
      ) {
        puntosToInsert.push(r);
      } else {
        errorsList.push({
          row: r.index,
          codigo: r.codigo,
          motivo: `Tipo "${r.tipo}" no reconocido para inserción`,
          raw: r
        });
      }
    });

    // 4. Inserción en tabla 'camaras'
    for (const item of camarasToInsert) {
      const payload: any = {
        codigo: item.codigo.trim(),
        estado_ciclo_vida: 'en_bodega',
        ubicacion_especifica: item.ubicacion ? item.ubicacion.trim() : null,
        marca: item.marca ? item.marca.trim() : null,
        modelo: item.modelo ? item.modelo.trim() : null,
        direccion_mac: item.mac ? item.mac.trim() : null,
        direccion_ip: item.ip ? item.ip.trim() : null,
      };

      try {
        const { error } = await supabase.from('camaras').insert([payload]);
        if (error) {
          let motivo = error.message;
          if (
            error.code === '23505' ||
            error.message?.toLowerCase().includes('duplicate key') ||
            error.message?.toLowerCase().includes('unique')
          ) {
            motivo = 'El código ya existe';
          }
          errorsList.push({
            row: item.index,
            codigo: item.codigo,
            motivo,
            raw: item
          });
        } else {
          successCount++;
        }
      } catch (err: any) {
        errorsList.push({
          row: item.index,
          codigo: item.codigo,
          motivo: err?.message || 'Error de conexión al insertar cámara',
          raw: item
        });
      }
    }

    // 5. Inserción en tabla 'puntos_red'
    for (const item of puntosToInsert) {
      let tipoPunto: 'datos_funcionario' | 'datos_alumno' | 'wifi_ap' = 'wifi_ap';
      if (item.tipo.includes('funcionario')) {
        tipoPunto = 'datos_funcionario';
      } else if (item.tipo.includes('alumno')) {
        tipoPunto = 'datos_alumno';
      } else {
        tipoPunto = 'wifi_ap';
      }

      const payload: any = {
        codigo: item.codigo.trim(),
        tipo_punto: tipoPunto,
        estado_ciclo_vida: 'en_bodega',
        ubicacion_especifica: item.ubicacion ? item.ubicacion.trim() : null,
        direccion_mac: item.mac ? item.mac.trim() : null,
        direccion_ip: item.ip ? item.ip.trim() : null,
      };

      try {
        const { error } = await supabase.from('puntos_red').insert([payload]);
        if (error) {
          let motivo = error.message;
          if (
            error.code === '23505' ||
            error.message?.toLowerCase().includes('duplicate key') ||
            error.message?.toLowerCase().includes('unique')
          ) {
            motivo = 'El código ya existe';
          }
          errorsList.push({
            row: item.index,
            codigo: item.codigo,
            motivo,
            raw: item
          });
        } else {
          successCount++;
        }
      } catch (err: any) {
        errorsList.push({
          row: item.index,
          codigo: item.codigo,
          motivo: err?.message || 'Error de conexión al insertar punto de red',
          raw: item
        });
      }
    }

    // Ordenar errores por orden de aparición en el CSV
    errorsList.sort((a, b) => a.row - b.row);

    setSimulationResult({
      total: totalProcessed,
      successCount,
      errorCount: errorsList.length,
      errorsList
    });

    if (successCount > 0) {
      onRefresh();
    }

    setIsProcessing(false);
    setStep(4);
  };

  // Step 4: Download error log
  const handleDownloadErrorLog = () => {
    if (!simulationResult || simulationResult.errorsList.length === 0) return;

    const headers = 'Fila,Codigo,Motivo_Error';
    const rows = simulationResult.errorsList.map(e => `"${e.row}","${e.codigo}","${e.motivo.replace(/"/g, '""')}"`).join('\n');
    const content = `${headers}\n${rows}\n`;

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `log_errores_importacion_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFinish = () => {
    onRefresh();
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs font-sans">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header with Title and Close Button */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-blue-600/30 text-blue-400 rounded-xl border border-blue-500/30 shadow-xs">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  Importación Masiva de Dispositivos
                </h2>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-blue-900/70 text-blue-300 border border-blue-700/60 font-medium">
                  Paso {step} de 4
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {step === 1 && 'Sube tu archivo CSV o descarga la plantilla oficial de APs y Cámaras'}
                {step === 2 && 'Empareja las columnas del archivo CSV con los campos del sistema'}
                {step === 3 && 'Revisa y valida la información antes de ejecutar la importación en bodega'}
                {step === 4 && 'Resumen de resultados de la importación y bitácora de registros'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper (Barra de Pasos Flexible y Limpia) */}
        <div className="px-6 sm:px-10 py-3.5 bg-slate-100/90 border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between w-full max-w-2xl mx-auto">
            {[1, 2, 3, 4].map((s, idx) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono transition-all ${
                      step === s
                        ? 'bg-blue-600 text-white shadow-xs ring-4 ring-blue-100'
                        : step > s
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {step > s ? '✓' : s}
                  </span>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap transition-colors ${
                      step === s
                        ? 'text-blue-700 font-bold'
                        : step > s
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    Paso {s}
                  </span>
                </div>
                {idx < 3 && (
                  <div
                    className={`flex-1 h-0.5 mx-3 sm:mx-5 transition-colors ${
                      step > s ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Modal Body: Dynamic Step Content with Generous Padding */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-slate-50">

          {/* PASO 1: Subida y Descarga de Plantilla (2 Columnas) */}
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              
              {/* Columna Izquierda: Descarga de Plantilla e Instrucciones */}
              <div className="flex flex-col justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Plantilla Oficial de Importación</h3>
                      <p className="text-xs text-slate-500">Cabeceras estandarizadas y ejemplos</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Si aún no tienes tu archivo estructurado, descarga nuestra plantilla CSV. Incluye ejemplos para 
                    Access Points (WiFi), Cámaras CCTV y tomas de red.
                  </p>

                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs rounded-lg border border-blue-200 transition-colors cursor-pointer shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>Descargar Plantilla CSV (.csv)</span>
                  </button>
                </div>

                {/* Resumen de columnas compatibles */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Campos reconocidos por el sistema:
                  </span>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono text-slate-600 pt-1">
                    <div><span className="font-bold text-slate-900">• codigo</span> (Obligatorio)</div>
                    <div><span className="font-bold text-slate-900">• tipo</span> (Obligatorio)</div>
                    <div><span className="text-slate-700">• mac</span> (Opcional)</div>
                    <div><span className="text-slate-700">• ip</span> (Opcional)</div>
                    <div><span className="text-slate-700">• marca</span> (Opcional)</div>
                    <div><span className="text-slate-700">• modelo</span> (Opcional)</div>
                    <div className="col-span-2"><span className="text-slate-700">• ubicacion</span> (Opcional)</div>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Zona Drag & Drop de Subida */}
              <div className="flex flex-col justify-center">
                {fileError && (
                  <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between gap-2 shadow-xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{fileError}</span>
                    </div>
                    <button onClick={() => setFileError(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`h-full min-h-[300px] border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-4 ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50/70 scale-[1.01]'
                      : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50/80 shadow-sm'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileProcess(e.target.files[0]);
                      }
                    }}
                  />

                  <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs">
                    <Upload className="w-8 h-8" />
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-sm sm:text-base font-bold text-slate-800">
                      Arrastra tu archivo CSV aquí, o <span className="text-blue-600 underline">explora tu equipo</span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      Archivos soportados: .csv (separador por comas o punto y coma)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50 px-3.5 py-1.5 rounded-full border border-slate-200 mt-2">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                    <span>Codificación recomendada: UTF-8</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* PASO 2: Mapeo de Campos (Grid 2 Columnas) */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Info de archivo cargado */}
              <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Archivo cargado: <span className="font-mono text-blue-600">{file?.name}</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Se detectaron <strong className="text-slate-800">{csvHeaders.length}</strong> columnas y <strong className="text-slate-800">{rawRows.length}</strong> filas con datos.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Cambiar archivo</span>
                </button>
              </div>

              {/* Grid de 2 Columnas para los selectores de mapeo */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5">
                {TARGET_FIELDS.map((tf) => {
                  const currentSelected = fieldMapping[tf.key] || '';
                  const sampleValue = currentSelected && rawRows[0] ? rawRows[0][currentSelected] : null;

                  return (
                    <div
                      key={tf.key}
                      className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-colors flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 font-mono">
                              {tf.key}
                            </span>
                            {tf.required ? (
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                Requerido
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                Opcional
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-sans truncate max-w-[170px] text-right font-medium">
                            {tf.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight">{tf.description}</p>
                      </div>

                      <div className="space-y-2 pt-1">
                        <select
                          value={currentSelected}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFieldMapping(prev => ({
                              ...prev,
                              [tf.key]: val
                            }));
                          }}
                          className={`w-full px-3 py-2 text-xs font-mono rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition-all ${
                            tf.required && !currentSelected
                              ? 'border-rose-300 bg-rose-50/40 text-rose-900'
                              : currentSelected
                              ? 'border-blue-300 bg-blue-50/30 text-slate-900 font-semibold'
                              : 'border-slate-300 bg-white text-slate-600'
                          }`}
                        >
                          <option value="">-- No mapear / Omitir --</option>
                          {csvHeaders.map(h => (
                            <option key={h} value={h}>
                              Columna CSV: "{h}"
                            </option>
                          ))}
                        </select>

                        {/* Texto de "Muestra Fila 1" ubicado DEBAJO del select */}
                        <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-400 uppercase font-sans font-medium">
                            Muestra Fila 1:
                          </span>
                          <span className="font-semibold text-slate-800 truncate">
                            {sampleValue !== null && sampleValue !== undefined && sampleValue !== ''
                              ? String(sampleValue)
                              : <span className="text-slate-400 italic">(Vacío)</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!isRequiredMappingComplete && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-800 shadow-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Debes mapear al menos los campos obligatorios: <strong>codigo</strong> y <strong>tipo</strong> para poder continuar.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* PASO 3: Previsualización y Validación (Tabla de Ancho Completo) */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Validation Summary Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-slate-500 font-medium block">Total Filas Leídas</span>
                    <span className="text-xl font-bold font-mono text-slate-900 mt-0.5">{totalProcessed}</span>
                  </div>
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                    <FileText className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-emerald-600 font-medium block">Registros Válidos</span>
                    <span className="text-xl font-bold font-mono text-emerald-700 mt-0.5">{validRowsCount}</span>
                  </div>
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>

                <div className={`p-4 rounded-xl border shadow-xs flex items-center justify-between ${
                  invalidRowsCount > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-slate-200 text-slate-400'
                }`}>
                  <div>
                    <span className="text-[11px] font-medium block">Con Inconsistencias</span>
                    <span className="text-xl font-bold font-mono mt-0.5">{invalidRowsCount}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl ${invalidRowsCount > 0 ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-400'}`}>
                    <AlertCircle className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Data Table que ocupa todo el ancho con padding aumentado */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                    Tabla de Datos Normalizados
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Mostrando las primeras {Math.min(totalProcessed, 50)} de {totalProcessed} filas
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[400px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-700 text-[11px] font-mono sticky top-0 border-b border-slate-200 z-10 shadow-2xs">
                      <tr>
                        <th className="py-3 px-4 w-14 text-center">#</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4">Código</th>
                        <th className="py-3 px-4">Tipo</th>
                        <th className="py-3 px-4">MAC</th>
                        <th className="py-3 px-4">IP</th>
                        <th className="py-3 px-4">Marca / Modelo</th>
                        <th className="py-3 px-4">Ubicación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {processedRows.slice(0, 50).map((row) => (
                        <tr
                          key={row.index}
                          className={`hover:bg-slate-50 transition-colors ${
                            !row.isValid ? 'bg-rose-50/50' : ''
                          }`}
                        >
                          <td className="py-3 px-4 text-center text-slate-400 text-[10px]">
                            {row.index}
                          </td>
                          <td className="py-3 px-4">
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 text-[10px] font-sans font-semibold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Válido
                              </span>
                            ) : (
                              <span 
                                className="inline-flex items-center gap-1 text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-300 text-[10px] font-sans font-semibold"
                                title={row.errors.join('; ')}
                              >
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                Error
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {row.codigo || <span className="text-rose-500 italic">(Vacío)</span>}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-tight ${
                              row.tipo === 'camara'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : row.tipo === 'wifi_ap'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {row.tipo || 'DESCONOCIDO'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {row.mac || '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {row.ip || '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {[row.marca, row.modelo].filter(Boolean).join(' / ') || '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-sans truncate max-w-[200px]">
                            {row.ubicacion || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {invalidRowsCount > 0 && (
                  <div className="p-3.5 bg-rose-50 border-t border-rose-200 flex items-center gap-2 text-xs text-rose-800">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      Hay <strong>{invalidRowsCount}</strong> fila(s) con inconsistencias. Los registros con error no serán importados y se guardarán en la bitácora de fallos.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PASO 4: Resultados y Log de Errores (Tarjetas Uniformes y Espaciadas) */}
          {step === 4 && simulationResult && (
            <div className="space-y-8 max-w-4xl mx-auto py-4">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200 shadow-sm">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  Proceso de Importación Finalizado
                </h3>
                <p className="text-xs text-slate-500">
                  La lectura e inserción del lote de dispositivos en bodega ha concluido.
                </p>
              </div>

              {/* Fila Uniforme de Tarjetas de Resumen con Más Espacio */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center space-y-1">
                  <span className="text-xs text-slate-500 font-medium block uppercase tracking-wider">Total Procesados</span>
                  <span className="text-3xl font-bold font-mono text-slate-900 mt-2 block">
                    {simulationResult.total}
                  </span>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-sm text-center space-y-1">
                  <span className="text-xs text-emerald-600 font-medium block uppercase tracking-wider">Importados con Éxito</span>
                  <span className="text-3xl font-bold font-mono text-emerald-600 mt-2 block">
                    {simulationResult.successCount}
                  </span>
                </div>

                <div className={`p-6 rounded-2xl border shadow-sm text-center space-y-1 ${
                  simulationResult.errorCount > 0 ? 'bg-rose-50/60 border-rose-200' : 'bg-white border-slate-200'
                }`}>
                  <span className={`text-xs font-medium block uppercase tracking-wider ${simulationResult.errorCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                    Fallidos / Omitidos
                  </span>
                  <span className={`text-3xl font-bold font-mono mt-2 block ${simulationResult.errorCount > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                    {simulationResult.errorCount}
                  </span>
                </div>
              </div>

              {/* Error Details Box if any errors */}
              {simulationResult.errorCount > 0 && (
                <div className="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
                  <div className="p-4 bg-rose-50/70 border-b border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-bold text-rose-800 flex items-center gap-2 font-mono">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      Detalle de Registros Fallidos ({simulationResult.errorsList.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleDownloadErrorLog}
                      className="px-3.5 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar Log de Errores (.CSV)</span>
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs font-mono">
                    {simulationResult.errorsList.map((err, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between gap-4 hover:bg-slate-50">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">
                            Fila {err.row}
                          </span>
                          <span className="font-bold text-slate-800">{err.codigo}</span>
                        </div>
                        <span className="text-rose-600 font-sans text-xs font-medium">
                          {err.motivo}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div>
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a Archivo</span>
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Modificar Mapeo</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step < 4 ? (
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            ) : null}

            {step === 2 && (
              <button
                type="button"
                disabled={!isRequiredMappingComplete}
                onClick={() => setStep(3)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                  isRequiredMappingComplete
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>Continuar a Previsualización</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleStartImport}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Validando e importando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Validar e Importar</span>
                  </>
                )}
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                onClick={handleFinish}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs"
              >
                Finalizar
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

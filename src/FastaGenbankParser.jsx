import React, { useState } from 'react';

function detectFormat(text) {
  const trimmed = text.trim();
  if (/^LOCUS/m.test(text)) return 'genbank';
  if (/^>/m.test(trimmed)) return 'fasta';
  return 'unknown';
}

function parseFasta(text) {
  // Split on '>' at start of line, ignore empty first chunk
  const records = text.split(/^>/m).map(s => s.trim()).filter(Boolean);
  return records.map(rec => {
    const lines = rec.split(/\r?\n/);
    const header = lines.shift().trim();
    const sequence = lines.join('').replace(/\s+/g, '');
    return { header, sequence, length: sequence.length };
  });
}

function parseGenBank(text) {
  const result = { locus: null, features: [] };

  // LOCUS: capture the entire locus line (first LOCUS line)
  const locusMatch = text.match(/^LOCUS\s+(.+)$/m);
  if (locusMatch) result.locus = locusMatch[0].trim();

  // FEATURES section: between line starting with 'FEATURES' and 'ORIGIN' or '//'
  const featuresStart = text.search(/^FEATURES/m);
  if (featuresStart === -1) return result;
  const originIndex = text.search(/^ORIGIN/m);
  const endIndex = originIndex !== -1 ? originIndex : text.indexOf('\n//', featuresStart);
  const featuresText = text.substring(featuresStart, endIndex === -1 ? undefined : endIndex);

  const lines = featuresText.split(/\r?\n/);
  let current = null;

  lines.forEach(line => {
    // Feature line: typically starts with 5 spaces, then key, then location
    const featMatch = line.match(/^\s{5}(\S+)\s+(.+)/);
    if (featMatch) {
      if (current) result.features.push(current);
      current = { key: featMatch[1], location: featMatch[2].trim(), qualifiers: {} };
      return;
    }

    // Qualifier line: typically starts with 21 spaces then /qual="value" or /qual=value or /qual
    const qualMatch = line.match(/^\s{21}\/([A-Za-z0-9_\-]+)(?:=(?:\"([^\"]*)\"|(\S+)))?/);
    if (qualMatch && current) {
      const qKey = qualMatch[1];
      const qVal = qualMatch[2] !== undefined ? qualMatch[2] : (qualMatch[3] !== undefined ? qualMatch[3] : true);
      // If qualifier already exists, turn into array
      if (current.qualifiers[qKey] === undefined) current.qualifiers[qKey] = qVal;
      else if (Array.isArray(current.qualifiers[qKey])) current.qualifiers[qKey].push(qVal);
      else current.qualifiers[qKey] = [current.qualifiers[qKey], qVal];
      return;
    }

    // Continuation lines for qualifier values (indented after 21 spaces)
    const contMatch = line.match(/^\s{21}(.+)/);
    if (contMatch && current) {
      // append to last qualifier's string if present
      const lastKey = Object.keys(current.qualifiers).slice(-1)[0];
      if (lastKey) {
        const prev = current.qualifiers[lastKey];
        const addition = contMatch[1].trim();
        if (typeof prev === 'string') current.qualifiers[lastKey] = (prev + ' ' + addition).trim();
        else if (Array.isArray(prev)) current.qualifiers[lastKey][current.qualifiers[lastKey].length - 1] += ' ' + addition;
      }
      return;
    }
  });

  if (current) result.features.push(current);
  return result;
}

export default function FastaGenbankParser() {
  const [filename, setFilename] = useState('');
  const [type, setType] = useState('');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');

  function handleFile(e) {
    setError('');
    setParsed(null);
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      const fmt = detectFormat(text);
      setType(fmt);
      if (fmt === 'fasta') {
        try {
          const data = parseFasta(text);
          setParsed({ fasta: data });
        } catch (err) {
          setError('Failed to parse FASTA: ' + err.message);
        }
      } else if (fmt === 'genbank') {
        try {
          const data = parseGenBank(text);
          setParsed({ genbank: data });
        } catch (err) {
          setError('Failed to parse GenBank: ' + err.message);
        }
      } else {
        setError('Unknown or unsupported file format');
      }
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsText(file);
  }

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', padding: 12 }}>
      <h2>FASTA / GenBank Parser</h2>
      <input type="file" onChange={handleFile} accept="*" />
      {filename && <div style={{ marginTop: 8 }}><strong>File:</strong> {filename}</div>}
      {type && <div><strong>Detected:</strong> {type}</div>}
      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      {parsed && parsed.fasta && (
        <div style={{ marginTop: 12 }}>
          <h3>FASTA Records ({parsed.fasta.length})</h3>
          {parsed.fasta.map((r, i) => (
            <div key={i} style={{ marginBottom: 10, padding: 8, border: '1px solid #ddd' }}>
              <div style={{ fontWeight: 'bold' }}>{r.header}</div>
              <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 6 }}>{r.sequence}</div>
              <div style={{ marginTop: 6, color: '#555' }}>Length: {r.length} bp</div>
            </div>
          ))}
        </div>
      )}

      {parsed && parsed.genbank && (
        <div style={{ marginTop: 12 }}>
          <h3>GenBank</h3>
          {parsed.genbank.locus && (
            <div style={{ marginBottom: 8 }}><strong>LOCUS:</strong> {parsed.genbank.locus}</div>
          )}
          <div>
            <h4>Features ({parsed.genbank.features.length})</h4>
            {parsed.genbank.features.map((f, idx) => (
              <div key={idx} style={{ marginBottom: 8, padding: 8, border: '1px solid #eee' }}>
                <div><strong>{f.key}</strong> — <span style={{ color: '#333' }}>{f.location}</span></div>
                {Object.keys(f.qualifiers).length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {Object.entries(f.qualifiers).map(([k, v]) => (
                      <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join('; ') : String(v)}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

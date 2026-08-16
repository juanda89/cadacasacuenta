# Respaldo de casos en Google Drive

Una hoja de Google Sheets **en tu Drive** que se actualiza sola cada hora con el
registro completo de casos. La compartes con quien quieras usando los permisos
normales de Drive. El archivo es tuyo: si la plataforma se cae, el respaldo queda.

## Cómo funciona

```
Tu hoja de Google ──(Apps Script, cada hora)──▶ cadacasacuenta.vercel.app/api/exporta/respaldo
        ▲                                                (protegido con llave secreta)
   la compartes
   desde Drive
```

- Pestaña **Registro**: datos anonimizados (los mismos del export público) — compartible con cualquiera.
- Pestaña **Completo** *(opcional, apagada por defecto)*: añade contacto, dirección y coordenada exacta. Solo se habilita poniendo `RESPALDO_COMPLETO=si` en Vercel, y esa hoja debe compartirse **únicamente** con quien tenga por qué ver datos personales (Ley 1581 de 2012).
- Pestaña **Historial**: una fila por sincronización (fecha + total de casos), para ver el crecimiento.

## Montarlo (5 minutos, una sola vez)

1. Crea una hoja nueva en tu Google Drive: [sheets.new](https://sheets.new) → nómbrala p. ej. "Cada Casa Cuenta — Respaldo".
2. En la hoja: **Extensiones → Apps Script**. Borra lo que haya y pega el script de abajo.
3. Reemplaza `PEGA_AQUI_LA_LLAVE` por el valor de `BACKUP_SECRET` (está en el `.env` del proyecto; pídemela y te la paso).
4. Corre una vez la función `sincronizar` (botón ▶). Google te pedirá autorizar tu propia cuenta — acepta.
5. Programa la actualización: en Apps Script, menú **Activadores** (el relojito) → **Añadir activador** → función `sincronizar`, tipo **Según tiempo**, **cada hora**.
6. Comparte la hoja desde Drive como cualquier archivo.

## El script

```javascript
// Cada Casa Cuenta — sincroniza el respaldo de casos en esta hoja.
const URL = "https://cadacasacuenta.vercel.app/api/exporta/respaldo";
const LLAVE = "PEGA_AQUI_LA_LLAVE";

function sincronizar() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const total = escribe(libro, "Registro", URL + "?alcance=anonimo");
  // Descomenta la línea siguiente SOLO si activaste RESPALDO_COMPLETO=si en Vercel
  // y esta hoja está restringida a personas autorizadas para ver datos personales:
  // escribe(libro, "Completo (restringido)", URL + "?alcance=completo");
  historial(libro, total);
}

function escribe(libro, nombre, url) {
  const res = UrlFetchApp.fetch(url, {
    headers: { "X-Llave-Respaldo": LLAVE },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(nombre + ": " + res.getResponseCode() + " " + res.getContentText().slice(0, 200));
  }
  const filas = Utilities.parseCsv(res.getContentText().replace(/^﻿/, ""));
  let tab = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  tab.clearContents();
  if (filas.length) {
    tab.getRange(1, 1, filas.length, filas[0].length).setValues(filas);
    tab.getRange(1, 1, 1, filas[0].length).setFontWeight("bold");
    tab.setFrozenRows(1);
  }
  return filas.length - 1;
}

function historial(libro, total) {
  let tab = libro.getSheetByName("Historial") || libro.insertSheet("Historial");
  if (tab.getLastRow() === 0) {
    tab.appendRow(["fecha_sincronizacion", "casos"]);
    tab.getRange(1, 1, 1, 2).setFontWeight("bold");
  }
  tab.appendRow([new Date(), total]);
}
```

## Notas

- **Esto complementa, no reemplaza, los backups de base de datos.** Supabase guarda los suyos; esta hoja es la copia *humana y compartible*.
- Si la llave se filtra, se rota: se cambia `BACKUP_SECRET` en Vercel y en el script.
- El endpoint responde `401` sin la llave y `403` si se pide el alcance completo sin haberlo activado — probado en producción.

# eComputing 2026 · Check-in profesional v3.1

App sencilla y profesional para registrar asistencia en las X Jornadas sobre la Enseñanza de la Informática en la FP a distancia.

Esta versión elimina de la interfaz cualquier campo para introducir la URL de Apps Script. La URL de la API queda configurada internamente en `docs/config.js`, por lo que recepción solo ve el flujo operativo: PIN, operador/a, día, cámara, escaneo y búsqueda manual.

## Arquitectura

```text
GitHub Pages / web estática HTTPS
  └── Cámara + escáner QR + UI profesional
      └── API Apps Script con JSONP
          └── Google Sheet Asistentes
```

La web estática está en `docs/`. El backend de Apps Script está en `apps_script/Code.gs`.

## Flujo de recepción

1. Abrir la URL pública de GitHub Pages en el móvil o portátil.
2. Introducir el PIN, elegir operador/a y día.
3. Activar la cámara.
4. Escanear el QR de la acreditación.
5. Confirmar el asistente.
6. Pulsar `Registrar jueves 2` o `Registrar viernes 3`.
7. La app evita duplicados y actualiza la hoja.

La URL de la API no aparece en pantalla. Se configura una vez en `docs/config.js`.

## Formato de la hoja `Asistentes`

La hoja debe llamarse exactamente `Asistentes` y tener estos encabezados en la fila 1:

```csv
codigo_qr,token,nombre,apellidos,institucion,email,checkin_jueves,hora_jueves,operador_jueves,checkin_viernes,hora_viernes,operador_viernes,observaciones
```

Ejemplo:

```csv
XJ-BIRTLH-0001,DEMO2026,Joan Carles,Pérez Vázquez,Generalitat de Catalunya,jperez14@xtec.cat,,,,,,,Asistente de prueba
```

El QR recomendado contiene solo el payload:

```text
XJ-BIRTLH-0001-DEMO2026
```

La API también acepta una URL que contenga el parámetro `code`, por si en algún momento se necesita:

```text
https://ejemplo/entrada?code=XJ-BIRTLH-0001-DEMO2026
```

## Instalación del backend Apps Script

1. Crear una Google Sheet llamada `ecomputing_2026_checkin`.
2. Crear una pestaña llamada `Asistentes`.
3. Importar `data/asistentes_ejemplo.csv` para probar.
4. Abrir `Extensiones > Apps Script`.
5. Copiar el contenido de `apps_script/Code.gs`.
6. Cambiar en `CONFIG`:

```javascript
SPREADSHEET_ID: 'PEGA_AQUI_EL_ID_DE_LA_GOOGLE_SHEET',
PIN: '2468'
```

7. Ejecutar `inicializarHojas()` una vez y autorizar permisos.
8. Desplegar como aplicación web:
   - Ejecutar como: `Yo`
   - Quién tiene acceso: `Cualquiera con el enlace`
9. Copiar la URL `/exec` resultante.

## Instalación del frontend en GitHub Pages

1. Crear un repositorio, por ejemplo `ecomputing-checkin`.
2. Subir todo este paquete al repositorio.
3. Editar `docs/config.js` y pegar la URL de Apps Script en `API_URL`:

```javascript
window.ECOMPUTING_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/XXXXXX/exec',
  DEFAULT_OPERATOR: 'Recepción 1',
  DEFAULT_DAY: 'jueves',
  EVENT_TITLE: 'eComputing 2026'
};
```

4. Activar GitHub Pages:
   - Source: GitHub Actions, si se usa el workflow incluido.
   - O publicar desde rama `main` y carpeta `/docs`.
5. Abrir la URL de Pages en el móvil.

## Publicación como release

Para versionar la app:

1. Crear tag, por ejemplo `v3.1.0`.
2. Crear una GitHub Release.
3. Adjuntar el ZIP del paquete.
4. Seguir usando GitHub Pages para la URL de uso en recepción.

## Seguridad y privacidad

- No incluir NIF ni restricciones alimentarias en la hoja de check-in.
- Usar solo código, token, nombre, apellidos, institución y email.
- Cambiar el PIN antes del evento.
- No publicar la hoja de cálculo.
- Mantener lista de papel de backup.

## Prueba rápida

Con la fila mock, prueba escaneando o pegando:

```text
XJ-BIRTLH-0001-DEMO2026
```

También puedes buscar manualmente por:

```text
Pérez
```

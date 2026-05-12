# Criterios de salida del piloto — Transición a v1 GA

> Qué tiene que pasar al final del piloto (Día 14 idealmente) para considerar v1 listo para producción "GA" (General Availability — facturación, marketing, escalamiento).

## KPIs cuantitativos (must-pass)

Al cierre del piloto, ejecutar `npm run kpis`. Los 3 KPIs DEBEN cumplirse:

| KPI | Objetivo | Cómo se mide |
|---|---|---|
| Días sin servicio en primera semana | **0** | `daysWithoutService` en KPIs script |
| % impresiones exitosas | **≥ 95%** | `printSuccessRate` |
| % rotaciones exitosas | **≥ 95%** | `rotationSuccessRate` (sólo cuenta rotaciones automáticas + manuales confirmadas) |

Si **cualquiera de los 3** está debajo del objetivo, el piloto NO cierra exitosamente. Análisis raíz + extensión de piloto 1 semana adicional.

## Criterios cualitativos (must-pass)

1. **Operador final satisfecho:** entrevista de 15 min con el dueño del restaurante. Preguntas:
   - "¿La app interrumpió alguna vez el servicio al cliente?"
   - "¿El mesero necesita ayuda recurrente para usar la app?"
   - "¿Sentiste el sistema confiable durante el piloto?"
   - "¿Si no tuvieras este sistema, qué harías?"
   - "¿Recomendarías este sistema a otro restaurante?"

   Las primeras 3 deben tener respuestas positivas. Las 2 últimas son para marketing.

2. **No hay hotfix crítico abierto sin deployar.** Todos los bugs críticos/medios identificados durante el piloto deben estar fixeados y deployados al cliente.

3. **Audit security manual:** el técnico de Okuni Solutions debe verificar al menos:
   - El PIN del admin sigue siendo el custom que el dueño eligió (no se reseteó).
   - El auto-arranque sigue activado.
   - `data.db` no excede 100 MB.
   - Los logs (`main.log`) no contienen passwords en texto plano (verificar contra D-030 sanitización de logs).

4. **Datos preservados en updates:** si durante el piloto se reinstaló el `.exe` 1+ veces, verificar que toda la config y los logs se preservaron en cada update.

## Criterios bloqueantes (must-not-have)

El piloto NO cierra exitosamente si:

- Algún bug Crítico abierto sin deploy (HOTFIX-POLICY).
- Pérdida de datos durante el piloto (ej. `data.db` desapareció y no se pudo recuperar — INC-04).
- El cliente reportó >2 noches sin WiFi para clientes (>2 fallos consecutivos de rotación sin remediación manual).
- Defender bloqueó el `.exe` y forzó una reinstalación con Apéndice C cada vez que reiniciaron Windows. Si pasa esto, considerar firmar el `.exe` antes de GA.

## Transición a GA

Si TODOS los criterios pasan:

1. **Tag v1 GA:**
   ```bash
   git tag v1.0.0 -m "v1 GA — piloto completado exitosamente <fecha>"
   git push origin v1.0.0
   ```

2. **Snapshot del último `.exe`:**
   - Renombrar el `.exe` final a `WiFi-Voucher-Manager-v1.0.0.exe`.
   - Publicar en GitHub Releases con el tag `v1.0.0`.
   - Calcular y publicar SHA-256 en la descripción del release.

3. **Documentación pública:**
   - Update `README.md` del repo con la sección "Releases" + link al v1.0.0.
   - Update `MANUAL-INSTALACION.md` § 2 para que apunte a GitHub Releases en lugar del CI artifact.

4. **Cliente:**
   - Email al dueño confirmando que el piloto cerró exitosamente.
   - Activar facturación / contrato de mantenimiento si aplica.
   - Acordar ventana de soporte: mensual / trimestral.

5. **Internal:**
   - Crear `docs/post-piloto-retrospectiva.md` con lecciones aprendidas, bugs encontrados, mejoras sugeridas para v2.
   - Backlog v2 documentado en `docs/runbooks/backlog-v2.md`.

## Si el piloto NO cierra

Análisis raíz:
- ¿Cuáles fueron los KPIs reales?
- ¿Qué tipo de fallo dominó (impresión, rotación, app crashes)?
- ¿Es un problema del producto o del entorno (hardware del cliente, red, etc.)?

Decisiones:
- **Extender piloto 1 semana** con un hotfix dirigido al problema dominante.
- **Volver a Fase 6** si hay un cambio de producto necesario (rare).
- **Cancelar** si el modelo de negocio no funciona (very rare).

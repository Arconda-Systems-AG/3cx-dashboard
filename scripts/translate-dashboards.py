#!/usr/bin/env python3
"""
Übersetzt alle 3CX Grafana-Dashboard-JSONs auf Deutsch.
Verbessert: Panel-Beschreibungen, Dauer-Formatierung, Spaltenbreiten.
"""

import json
import os
import glob

# ── Übersetzungs-Mapping ────────────────────────────────────────────────────

TRANSLATIONS = {
    # Dashboard-Titel (Root-Level)
    "01. Overview (PostgreSQL)": "01. Überblick (PostgreSQL)",
    "01. Overview (MySQL)": "01. Überblick (MySQL)",
    "01. Overview (MSSQL)": "01. Überblick (MSSQL)",
    "01. Overview (BigQuery)": "01. Überblick (BigQuery)",
    "02. Ring Groups (PostgreSQL)": "02. Rufgruppen (PostgreSQL)",
    "02. Ring Groups (MySQL)": "02. Rufgruppen (MySQL)",
    "02. Ring Groups (MSSQL)": "02. Rufgruppen (MSSQL)",
    "02. Ring Groups (BigQuery)": "02. Rufgruppen (BigQuery)",
    "03. Queues (PostgreSQL)": "03. Warteschlangen (PostgreSQL)",
    "03. Queues (MySQL)": "03. Warteschlangen (MySQL)",
    "03. Queues (MSSQL)": "03. Warteschlangen (MSSQL)",
    "03. Queues (BigQuery)": "03. Warteschlangen (BigQuery)",
    "04. Queue Missed Calls & Callback Efficiency (PostgreSQL)": "04. Verpasste Anrufe & Rückruf-Effizienz (PostgreSQL)",
    "04. Queue Missed Calls & Callback Efficiency (MySQL)": "04. Verpasste Anrufe & Rückruf-Effizienz (MySQL)",
    "04. Queue Missed Calls & Callback Efficiency (MSSQL)": "04. Verpasste Anrufe & Rückruf-Effizienz (MSSQL)",
    "04. Queue Missed Calls & Callback Efficiency (BigQuery)": "04. Verpasste Anrufe & Rückruf-Effizienz (BigQuery)",
    "05. Extension Statistics (PostgreSQL)": "05. Durchwahl-Statistiken (PostgreSQL)",
    "05. Extension Statistics (MySQL)": "05. Durchwahl-Statistiken (MySQL)",
    "05. Extension Statistics (MSSQL)": "05. Durchwahl-Statistiken (MSSQL)",
    "05. Extension Statistics (BigQuery)": "05. Durchwahl-Statistiken (BigQuery)",
    "06. Inbound Calls (PostgreSQL)": "06. Eingehende Anrufe (PostgreSQL)",
    "06. Inbound Calls (MySQL)": "06. Eingehende Anrufe (MySQL)",
    "06. Inbound Calls (MSSQL)": "06. Eingehende Anrufe (MSSQL)",
    "06. Inbound Calls (BigQuery)": "06. Eingehende Anrufe (BigQuery)",
    "07. Outbound Calls (PostgreSQL)": "07. Ausgehende Anrufe (PostgreSQL)",
    "07. Outbound Calls (MySQL)": "07. Ausgehende Anrufe (MySQL)",
    "07. Outbound Calls (MSSQL)": "07. Ausgehende Anrufe (MSSQL)",
    "07. Outbound Calls (BigQuery)": "07. Ausgehende Anrufe (BigQuery)",
    "08. Inbound vs Outbound call traffic analysis (PostgreSQL)": "08. Eingehend vs. Ausgehend Analyse (PostgreSQL)",
    "08. Inbound vs Outbound call traffic analysis (MySQL)": "08. Eingehend vs. Ausgehend Analyse (MySQL)",
    "08. Inbound vs Outbound call traffic analysis (MSSQL)": "08. Eingehend vs. Ausgehend Analyse (MSSQL)",
    "08. Inbound vs Outbound call traffic analysis (BigQuery)": "08. Eingehend vs. Ausgehend Analyse (BigQuery)",
    "09. Outbound Call Legs By Cost, (Participants & Extensions) (PostgreSQL)": "09. Hochwertige Anrufe & Kosten (PostgreSQL)",
    "09. Outbound Call Legs By Cost, (Participants & Extensions) (MySQL)": "09. Hochwertige Anrufe & Kosten (MySQL)",
    "09. Outbound Call Legs By Cost, (Participants & Extensions) (MSSQL)": "09. Hochwertige Anrufe & Kosten (MSSQL)",
    "09. Outbound Call Legs By Cost, (Participants & Extensions) (BigQuery)": "09. Hochwertige Anrufe & Kosten (BigQuery)",
    "09. High Value Calls, Consumers and Extensions (PostgreSQL)": "09. Hochwertige Anrufe & Kosten (PostgreSQL)",
    "09. High Value Calls, Consumers and Extensions (MySQL)": "09. Hochwertige Anrufe & Kosten (MySQL)",
    "09. High Value Calls, Consumers and Extensions (MSSQL)": "09. Hochwertige Anrufe & Kosten (MSSQL)",
    "09. High Value Calls, Consumers and Extensions (BigQuery)": "09. Hochwertige Anrufe & Kosten (BigQuery)",
    "10. Missed Calls & Redialed Callbacks (PostgreSQL)": "10. Verpasste Anrufe & Rückrufe (PostgreSQL)",
    "10. Missed Calls & Redialed Callbacks (MySQL)": "10. Verpasste Anrufe & Rückrufe (MySQL)",
    "10. Missed Calls & Redialed Callbacks (MSSQL)": "10. Verpasste Anrufe & Rückrufe (MSSQL)",
    "10. Missed Calls & Redialed Callbacks (BigQuery)": "10. Verpasste Anrufe & Rückrufe (BigQuery)",
    "11. Call Recordings Explorer (PostgreSQL)": "11. Anrufaufzeichnungen (PostgreSQL)",
    "11. Call Recordings Explorer (MySQL)": "11. Anrufaufzeichnungen (MySQL)",
    "11. Call Recordings Explorer (MSSQL)": "11. Anrufaufzeichnungen (MSSQL)",
    "11. Call Recordings Explorer (BigQuery)": "11. Anrufaufzeichnungen (BigQuery)",
    "12. Health and Performance (PostgreSQL)": "12. Systemgesundheit & Performance (PostgreSQL)",
    "12. Health and Performance (MySQL)": "12. Systemgesundheit & Performance (MySQL)",
    "12. Health and Performance (MSSQL)": "12. Systemgesundheit & Performance (MSSQL)",
    "12. Health and Performance (BigQuery)": "12. Systemgesundheit & Performance (BigQuery)",
    "13. Call Quality Monitoring (PostgreSQL)": "13. Anrufqualitäts-Überwachung (PostgreSQL)",
    "13. Call Quality Monitoring (MySQL)": "13. Anrufqualitäts-Überwachung (MySQL)",
    "13. Call Quality Monitoring (MSSQL)": "13. Anrufqualitäts-Überwachung (MSSQL)",
    "13. Call Quality Monitoring (BigQuery)": "13. Anrufqualitäts-Überwachung (BigQuery)",
    "14. Frequent Inbound Callers (PostgreSQL)": "14. Häufige eingehende Anrufer (PostgreSQL)",
    "14. Frequent Inbound Callers (MySQL)": "14. Häufige eingehende Anrufer (MySQL)",
    "14. Frequent Inbound Callers (MSSQL)": "14. Häufige eingehende Anrufer (MSSQL)",
    "14. Frequent Inbound Callers (BigQuery)": "14. Häufige eingehende Anrufer (BigQuery)",

    # Markdown-Header
    "# 3CX call overview": "# 3CX Anrufübersicht",
    "# Extension Statistics Dashboard": "# Durchwahl-Statistiken",
    "# Inbound Calls": "# Eingehende Anrufe",
    "# Outbound Calls": "# Ausgehende Anrufe",
    "# Inbound vs Outbound Call Traffic Analysis": "# Eingehend vs. Ausgehend Verkehrsanalyse",
    "# 3CX - Outbound Call Legs By Cost (Participants & Extensions)": "# 3CX – Ausgehende Anrufe nach Kosten",
    "# Missed Calls & Redialed Callbacks": "# Verpasste Anrufe & Rückrufe",
    "# Call Recordings Explorer": "# Anrufaufzeichnungen",
    "# Call Quality Monitoring": "# Anrufqualitäts-Überwachung",
    "# Frequent Inbound Callers": "# Häufige eingehende Anrufer",

    # Panel-Titel
    "Total number of calls": "Gesamtanzahl Anrufe",
    "Answered Calls": "Angenommene Anrufe",
    "% Answered Calls": "% Angenommene Anrufe",
    "Not Answered": "Nicht angenommen",
    "Total Talking Duration": "Gesamte Gesprächsdauer",
    "Average Talking Duration": "Ø Gesprächsdauer",
    "Average Call Duration": "Ø Anrufdauer",
    "Longest Call Duration": "Längste Anrufdauer",
    "% Extension Missed Calls": "% Verpasste Anrufe (Durchwahl)",
    "Final Termination Reasons": "Abschlussgründe",
    "Amount of Calls over Time": "Anrufverlauf",
    "Top 10 Most Dialled Numbers": "Top 10 meistgewählte Nummern",
    "Top 10 Answered Extensions": "Top 10 aktive Durchwahlen",
    "Top 10 Extensions with Missed Calls": "Top 10 Durchwahlen mit verpassten Anrufen",
    "Calls Received": "Eingegangene Anrufe",
    "Calls Answered": "Angenommene Anrufe",
    "% Calls Answered": "% Angenommene Anrufe",
    "Calls Not Answered": "Nicht angenommene Anrufe",
    "% Missed Calls": "% Verpasste Anrufe",
    "Average Ringing Time": "Ø Klingelzeit",
    "Call Outcomes": "Anrufergebnis",
    "Ring Group Call Statistics": "Rufgruppen-Statistik",
    "Received Calls over Time": "Eingegangene Anrufe (Verlauf)",
    "Received / Answered Calls over Time": "Eingegangene / Angenommene Anrufe (Verlauf)",
    "Call Statistics by Ring Group Users": "Anrufstatistik nach Rufgruppenmitgliedern",
    "Call Statistics by Queue Agents": "Anrufstatistik nach Agenten",
    "Queue Call Statistics": "Warteschlangen-Statistik",
    "Serviced Callbacks [auto]": "Rückrufe bearbeitet [automatisch]",
    "Serviced Callbacks [auto & manual]": "Rückrufe bearbeitet [auto & manuell]",
    "Average Callback Delay [auto & manual]": "Ø Rückrufverzögerung [auto & manuell]",
    "Longest Callback Delay [auto & manual]": "Längste Rückrufverzögerung [auto & manuell]",
    "Callback Delay [auto & manual]": "Rückrufverzögerung [auto & manuell]",
    "Calls Abandoned": "Abgebrochene Anrufe",
    "% Calls Abandoned": "% Abgebrochene Anrufe",
    "Missed Calls List & Callbacks": "Liste verpasster Anrufe & Rückrufe",
    "TOTALS": "GESAMT",
    "Extension Count": "Anzahl Durchwahlen",
    "In [Answered]": "Eingehend [angenommen]",
    "In [Not Answered]": "Eingehend [nicht angenommen]",
    "Out [Answered]": "Ausgehend [angenommen]",
    "Out [Not Answered]": "Ausgehend [nicht angenommen]",
    "Total [Answered]": "Gesamt [angenommen]",
    "Total [Not Answered]": "Gesamt [nicht angenommen]",
    "Talking Time": "Gesprächszeit",
    "Extension Statistics": "Durchwahl-Statistiken",
    "Calls By DID": "Anrufe nach DID",
    "Inbound Calls over Time": "Eingehende Anrufe (Verlauf)",
    "Top Called Extensions": "Top Durchwahlen",
    "Inbound Calls List": "Liste eingehender Anrufe",
    "Calls Made": "Getätigte Anrufe",
    "Outbound Calls over Time": "Ausgehende Anrufe (Verlauf)",
    "Top Caller Extensions": "Top anrufende Durchwahlen",
    "Outbound Calls": "Ausgehende Anrufe",
    "Total Calls": "Gesamte Anrufe",
    "Answered Inbound": "Angenommene eingehende Anrufe",
    "Answered Outbound": "Angenommene ausgehende Anrufe",
    "Inbound Duration": "Eingehend Dauer",
    "Inbound Talking Duration": "Eingehend Gesprächsdauer",
    "Outbound Duration": "Ausgehend Dauer",
    "Outbound Talking Duration": "Ausgehend Gesprächsdauer",
    "Outbound Cost": "Ausgehend Kosten",
    "Calls by Direction": "Anrufe nach Richtung",
    "Inbound Call Duration": "Eingehend Anrufdauer",
    "Outbound Call Duration": "Ausgehend Anrufdauer",
    "Outbound Call Cost": "Ausgehend Anrufkosten",
    "Call Traffic over Time": "Anrufverkehr (Verlauf)",
    "Overview": "Übersicht",
    "Answered Connections": "Angenommene Verbindungen",
    "% Over Threshold": "% über Schwellwert",
    "Avg. Cost": "Ø Kosten",
    "Total Cost": "Gesamtkosten",
    "Avg. Talk Time": "Ø Gesprächszeit",
    "Total Talk Time": "Gesamte Gesprächszeit",
    "Talk Time Distribution": "Gesprächszeit-Verteilung",
    "Cost Distribution": "Kosten-Verteilung",
    "Details": "Details",
    "Top Destination Participants": "Top Ziel-Teilnehmer",
    "Top Extensions with Calls OVer Cost Threshold": "Top Durchwahlen über Kostenschwellwert",
    "Most Expensive Calls": "Teuerste Anrufe",
    "Missed calls": "Verpasste Anrufe",
    "Total number of recordings": "Gesamtanzahl Aufzeichnungen",
    "Average Sentiment Score": "Ø Stimmungswert",
    "Sentiment Score Over Time": "Stimmungswert (Verlauf)",
    "Total Duration": "Gesamtdauer",
    "Recordings": "Aufzeichnungen",
    "CPU Usage Over Time": "CPU-Auslastung (Verlauf)",
    "Memory Usage Over Time": "Speicherauslastung (Verlauf)",
    "Current CPU Usage": "Aktuelle CPU-Auslastung",
    "Current Memory Usage": "Aktuelle Speicherauslastung",
    "Current Disk Usage": "Aktuelle Festplattenauslastung",
    "Most Active Service": "Aktivster Dienst",
    "Disk Space Trends": "Festplattentrend",
    "Network Traffic (Bytes/sec)": "Netzwerkverkehr (Bytes/Sek.)",
    "Service Memory Usage": "Dienst-Speicherverbrauch",
    "Service Thread Count": "Dienst-Thread-Anzahl",
    "Service Details Over Time": "Dienstdetails (Verlauf)",
    "Average Jitter": "Ø Jitter",
    "Average Packet Loss %": "Ø Paketverlust %",
    "Average Round Trip Time ms": "Ø Roundtrip-Zeit (ms)",
    "Quality Score Over Time": "Qualitätswert (Verlauf)",
    "Codec distribution": "Codec-Verteilung",
    "Average Packet Loss Over Time": "Ø Paketverlust (Verlauf)",
    "Distribution of Overal Score": "Gesamtwert-Verteilung",
    "Call Quality Report": "Anrufqualitätsbericht",
    "Top 100 Frequent Callers By Calls": "Top 100 häufigste Anrufer (nach Anzahl)",
    "Top 100 Frequent Callers By Talking Duration": "Top 100 häufigste Anrufer (nach Gesprächsdauer)",
    "Talking Duration over Time": "Gesprächsdauer (Verlauf)",

    # RenameByName-Werte (Tabellenspalten)
    "Total calls": "Gesamte Anrufe",
    "Calls answered at the end": "Angenommen",
    "Calls not answered at the end": "Nicht angenommen",
    "Total talking duration": "Gesamte Gesprächsdauer",
    "Average talking duration": "Ø Gesprächsdauer",
    "Average call duration": "Ø Anrufdauer",
    "Longest call duration": "Längste Anrufdauer",
    "Calls received": "Eingegangene Anrufe",
    "Calls answered": "Angenommene Anrufe",
    "Calls not answered": "Nicht angenommene Anrufe",
    "Average ringing time": "Ø Klingelzeit",
    "Calls Not Serviced": "Nicht bedient",
    "Serviced Callbacks [auto]": "Rückrufe bearbeitet [auto]",
    "Average callback response time": "Ø Rückrufreaktionszeit",
    "Callback Delay Time": "Rückrufverzögerungszeit",
    "< 5 min": "< 5 Min.",
    "5-10 min": "5–10 Min.",
    "10-15 min": "10–15 Min.",
    "15-20 min": "15–20 Min.",
    "20+ min": "20+ Min.",
    "Answered at": "Angenommen am",
    "Answered At": "Angenommen am",
    "Bill cost": "Kosten",
    "Callee": "Angerufener",
    "Caller": "Anrufer",
    "Callback delay": "Rückrufverzögerung",
    "Callback final type": "Rückruftyp (final)",
    "Callback in 24H": "Rückruf in 24h",
    "Callback made within 24 hours": "Rückruf in 24h",
    "Callback started at": "Rückruf begonnen am",
    "Callback status": "Rückrufstatus",
    "Callback talking duration": "Rückruf Gesprächsdauer",
    "Callback type": "Rückruftyp",
    "Duration": "Dauer",
    "DID": "DID",
    "Extension": "Durchwahl",
    "Extension Name": "Name",
    "External participant": "Externer Teilnehmer",
    "Gen Call ID": "Anruf-ID",
    "Call ID": "Anruf-ID",
    "In [answered]": "Eingehend [angenommen]",
    "In [not answered]": "Eingehend [nicht angenommen]",
    "Out [answered]": "Ausgehend [angenommen]",
    "Out [not answered]": "Ausgehend [nicht angenommen]",
    "Total [answered]": "Gesamt [angenommen]",
    "Total [not answered]": "Gesamt [nicht angenommen]",
    "Talking time": "Gesprächszeit",
    "Ringing duration": "Klingeldauer",
    "Source participant": "Teilnehmer (Quelle)",
    "Who made the callback?": "Wer hat zurückgerufen?",
    "Queue": "Warteschlange",
    "Started at": "Begonnen am",
    "Started At": "Begonnen am",
    "Ended at": "Beendet am",
    "Ended At": "Beendet am",
    "Talking duration": "Gesprächsdauer",
    "Talking Duration": "Gesprächsdauer",
    "% answered": "% angenommen",
    "Calls": "Anrufe",
    "Time": "Zeit",
    "Inbound calls": "Eingehende Anrufe",
    "Outbound calls": "Ausgehende Anrufe",
    "Inbound duration": "Eingehend Dauer",
    "Inbound talking duration": "Eingehend Gesprächsdauer",
    "Outbound duration": "Ausgehend Dauer",
    "Outbound talking duration": "Ausgehend Gesprächsdauer",
    "Outbound cost": "Ausgehend Kosten",
    "Answered Inbound": "Angenommene Eingehende",
    "Answered Outbound": "Angenommene Ausgehende",
    "1 - 3 min": "1–3 Min.",
    "< 1 min": "< 1 Min.",
    "> 3 min": "> 3 Min.",
    "1.00 - 2.00": "1,00–2,00",
    "< 1.00": "< 1,00",
    "> 2.00": "> 2,00",
    "Local participant": "Lokaler Teilnehmer",
    "Over Threshold": "Über Schwellwert",
    "Under Threshold": "Unter Schwellwert",
    "Total": "Gesamt",
    "Average Bill Cost": "Ø Abrechnungskosten",
    "Total Bill Cost": "Gesamte Abrechnungskosten",
    "Connections": "Verbindungen",
    "Cinsumer": "Verbraucher",
    "Connections with Bill Cost": "Verbindungen mit Kosten",
    "Connections Cost Sum": "Gesamtkosten",
    "Over Threshold Count": "Über Schwellwert",
    "Participant": "Teilnehmer",
    "Talk Time": "Gesprächszeit",
    "Connections to Participants with Bill Cost": "Verbindungen zu Teilnehmern mit Kosten",
    "Bill code": "Abrechnungscode",
    "Bill rate": "Abrechnungsrate",
    "Bill rate name": "Abrechnungsratename",
    "Destination": "Ziel",
    "Destination Bill Code": "Ziel-Abrechnungscode",
    "Destination Bill Cost": "Ziel-Abrechnungskosten",
    "Destination Bill Rate": "Ziel-Abrechnungsrate",
    "Destination Bill Rate Name": "Ziel-Abrechnungsratename",
    "Destination Talk Time": "Ziel-Gesprächszeit",
    "Source": "Quelle",
    "Originator Bill Code": "Ursprungs-Abrechnungscode",
    "Source Bill Cost": "Ursprung-Abrechnungskosten",
    "Source Bill Rate": "Ursprung-Abrechnungsrate",
    "Source Bill Rate Name": "Ursprung-Abrechnungsratename",
    "Originator": "Anrufer",
    "Originator Talk Time": "Anrufer-Gesprächszeit",
    "Inbound Caller": "Eingehender Anrufer",
    "Free disk space": "Freier Speicher",
    "Used disk space": "Genutzter Speicher",
    "Network IN": "Netzwerk eingehend",
    "Network OUT": "Netzwerk ausgehend",
    "Service": "Dienst",
    "Memory (MB)": "Speicher (MB)",
    "Memory, MB": "Speicher (MB)",
    "Service Name": "Dienstname",
    "Private Memory": "Privater Speicher",
    "Handle count": "Handle-Anzahl",
    "Memory usage": "Speicherverbrauch",
    "Process count": "Prozess-Anzahl",
    "Thread count": "Thread-Anzahl",
    "Sentiment Score": "Stimmungswert",
    "Fime Name": "Dateiname",
    "Start Time": "Startzeit",
    "Summary": "Zusammenfassung",
    "Transcription": "Transkription",
    "Score": "Wert",
    "Codec": "Codec",
    "Call legs": "Anrufteilstrecken",
    "Caller Address": "Anrufer-Adresse",
    "Caller Codec": "Anrufer-Codec",
    "Caller Duration": "Anrufer-Dauer",
    "Caller Location": "Anrufer-Standort",
    "Caller from PBX Score": "Anrufer von PBX-Wert",
    "Caller to PBX Score": "Anrufer zu PBX-Wert",
    "Caller RTT (ms)": "Anrufer RTT (ms)",
    "Caller Packet Count from PBX": "Anrufer Pakete von PBX",
    "Caller Jitter from PBX (ms)": "Anrufer Jitter von PBX (ms)",
    "Caller Packet Loss from PBX %": "Anrufer Paketverlust von PBX %",
    "Caller Packet Count to PBX": "Anrufer Pakete zu PBX",
    "Caller Jitter to PBX (ms)": "Anrufer Jitter zu PBX (ms)",
    "Caller Packet Loss to PBX %": "Anrufer Paketverlust zu PBX %",
    "Callee Address": "Angerufener-Adresse",
    "Callee Codec": "Angerufener-Codec",
    "Callee Duration": "Angerufener-Dauer",
    "Callee Location": "Angerufener-Standort",
    "Callee from PBX Score": "Angerufener von PBX-Wert",
    "Callee to PBX Score": "Angerufener zu PBX-Wert",
    "Callee RTT (ms)": "Angerufener RTT (ms)",
    "Callee Packet Count from PBX": "Angerufener Pakete von PBX",
    "Callee Jitter from PBX (ms)": "Angerufener Jitter von PBX (ms)",
    "Callee Packet Loss from PBX %": "Angerufener Paketverlust von PBX %",
    "Callee Packet Count to PBX": "Angerufener Pakete zu PBX",
    "Callee Jitter to PBX (ms)": "Angerufener Jitter zu PBX (ms)",
    "Callee Packet Loss to PBX %": "Angerufener Paketverlust zu PBX %",
    "Mode": "Modus",
    "Overall Score": "Gesamtwert",
    "Overal Score": "Gesamtwert",
    "Overall Summary": "Gesamtzusammenfassung",
    "Number of calls": "Anzahl Anrufe",
}

# ── Panel-Beschreibungen ────────────────────────────────────────────────────

DESCRIPTIONS = {
    "Gesamtanzahl Anrufe": "Gesamtzahl aller Anrufe im gewählten Zeitraum",
    "Angenommene Anrufe": "Anzahl der Anrufe, die erfolgreich angenommen wurden",
    "% Angenommene Anrufe": "Prozentualer Anteil der Anrufe, die erfolgreich angenommen wurden",
    "Nicht angenommen": "Anzahl der Anrufe, die nicht angenommen wurden",
    "Gesamte Gesprächsdauer": "Summe aller Gesprächszeiten im gewählten Zeitraum",
    "Ø Gesprächsdauer": "Durchschnittliche Gesprächszeit pro angenommenem Anruf",
    "Ø Anrufdauer": "Durchschnittliche Gesamtdauer aller Anrufe inkl. Klingelzeit",
    "Längste Anrufdauer": "Dauer des längsten Anrufs im gewählten Zeitraum",
    "% Verpasste Anrufe (Durchwahl)": "Prozentualer Anteil der verpassten Anrufe auf Durchwahlen",
    "Abschlussgründe": "Übersicht der Gründe, aus denen Anrufe beendet wurden",
    "Anrufverlauf": "Zeitlicher Verlauf der Anrufanzahl im gewählten Zeitraum",
    "Top 10 meistgewählte Nummern": "Die 10 am häufigsten gewählten externen Rufnummern",
    "Top 10 aktive Durchwahlen": "Die 10 Durchwahlen mit den meisten angenommenen Anrufen",
    "Top 10 Durchwahlen mit verpassten Anrufen": "Die 10 Durchwahlen mit den meisten verpassten Anrufen",
    "Eingegangene Anrufe": "Gesamtzahl der eingegangenen Anrufe im Zeitraum",
    "Nicht angenommene Anrufe": "Anzahl der Anrufe, die nicht angenommen wurden",
    "% Verpasste Anrufe": "Prozentualer Anteil nicht angenommener Anrufe",
    "Ø Klingelzeit": "Durchschnittliche Wartezeit bis zur Annahme",
    "Anrufergebnis": "Verteilung der Anrufergebnisse (angenommen, verpasst, etc.)",
    "Rufgruppen-Statistik": "Detaillierte Anrufstatistik der Rufgruppe im Zeitraum",
    "Eingegangene Anrufe (Verlauf)": "Zeitlicher Verlauf der eingegangenen Anrufe",
    "Eingegangene / Angenommene Anrufe (Verlauf)": "Zeitlicher Vergleich von eingegangenen und angenommenen Anrufen",
    "Anrufstatistik nach Rufgruppenmitgliedern": "Anrufstatistik aufgeschlüsselt nach einzelnen Mitgliedern der Rufgruppe",
    "Anrufstatistik nach Agenten": "Anrufstatistik aufgeschlüsselt nach Warteschlangen-Agenten",
    "Warteschlangen-Statistik": "Detaillierte Anrufstatistik der Warteschlange im Zeitraum",
    "Rückrufe bearbeitet [automatisch]": "Anzahl der automatisch bearbeiteten Rückrufanfragen",
    "Rückrufe bearbeitet [auto & manuell]": "Anzahl der automatisch und manuell bearbeiteten Rückrufanfragen",
    "Ø Rückrufverzögerung [auto & manuell]": "Durchschnittliche Wartezeit bis zum Rückruf",
    "Längste Rückrufverzögerung [auto & manuell]": "Längste Wartezeit bis zum Rückruf im Zeitraum",
    "Rückrufverzögerung [auto & manuell]": "Verteilung der Rückrufverzögerungen nach Zeitintervallen",
    "Abgebrochene Anrufe": "Anzahl der Anrufe, die vor der Annahme aufgelegt wurden",
    "% Abgebrochene Anrufe": "Prozentualer Anteil der abgebrochenen Anrufe",
    "Liste verpasster Anrufe & Rückrufe": "Detaillierte Liste aller verpassten Anrufe mit Rückrufstatus",
    "GESAMT": "Gesamtstatistik aller Durchwahlen im gewählten Zeitraum",
    "Anzahl Durchwahlen": "Gesamtzahl der aktiven Durchwahlen im Zeitraum",
    "Eingehend [angenommen]": "Anzahl der angenommenen eingehenden Anrufe",
    "Eingehend [nicht angenommen]": "Anzahl der nicht angenommenen eingehenden Anrufe",
    "Ausgehend [angenommen]": "Anzahl der angenommenen ausgehenden Anrufe",
    "Ausgehend [nicht angenommen]": "Anzahl der nicht angenommenen ausgehenden Anrufe",
    "Gesamt [angenommen]": "Gesamtzahl der angenommenen Anrufe (ein- und ausgehend)",
    "Gesamt [nicht angenommen]": "Gesamtzahl der nicht angenommenen Anrufe",
    "Gesprächszeit": "Gesamte Gesprächszeit im gewählten Zeitraum",
    "Durchwahl-Statistiken": "Detaillierte Statistiken aller Durchwahlen im Zeitraum",
    "Anrufe nach DID": "Verteilung der Anrufe auf die verschiedenen DID-Nummern",
    "Eingehende Anrufe (Verlauf)": "Zeitlicher Verlauf der eingehenden Anrufe",
    "Top Durchwahlen": "Die Durchwahlen mit den meisten eingehenden Anrufen",
    "Liste eingehender Anrufe": "Detaillierte Liste aller eingehenden Anrufe im Zeitraum",
    "Getätigte Anrufe": "Gesamtzahl der getätigten ausgehenden Anrufe",
    "Ausgehende Anrufe (Verlauf)": "Zeitlicher Verlauf der ausgehenden Anrufe",
    "Top anrufende Durchwahlen": "Die Durchwahlen mit den meisten ausgehenden Anrufen",
    "Ausgehende Anrufe": "Detaillierte Liste aller ausgehenden Anrufe im Zeitraum",
    "Gesamte Anrufe": "Gesamtzahl aller Anrufe (ein- und ausgehend)",
    "Angenommene eingehende Anrufe": "Anzahl der angenommenen eingehenden Anrufe",
    "Angenommene ausgehende Anrufe": "Anzahl der angenommenen ausgehenden Anrufe",
    "Eingehend Dauer": "Gesamtdauer aller eingehenden Anrufe",
    "Eingehend Gesprächsdauer": "Gesamte Gesprächszeit aller eingehenden Anrufe",
    "Ausgehend Dauer": "Gesamtdauer aller ausgehenden Anrufe",
    "Ausgehend Gesprächsdauer": "Gesamte Gesprächszeit aller ausgehenden Anrufe",
    "Ausgehend Kosten": "Gesamtkosten der ausgehenden Anrufe",
    "Anrufe nach Richtung": "Vergleich von eingehenden und ausgehenden Anrufen",
    "Eingehend Anrufdauer": "Verteilung der eingehenden Anrufe nach Dauer",
    "Ausgehend Anrufdauer": "Verteilung der ausgehenden Anrufe nach Dauer",
    "Ausgehend Anrufkosten": "Verteilung der ausgehenden Anrufkosten",
    "Anrufverkehr (Verlauf)": "Zeitlicher Verlauf des Anrufverkehrs (ein- und ausgehend)",
    "Übersicht": "Überblick über die hochwertigsten ausgehenden Anrufe",
    "Angenommene Verbindungen": "Anzahl der Verbindungen über und unter dem Kostenschwellwert",
    "% über Schwellwert": "Prozentualer Anteil der Verbindungen über dem Kostenschwellwert",
    "Ø Kosten": "Durchschnittliche Kosten pro Verbindung über Schwellwert",
    "Gesamtkosten": "Gesamtkosten aller Verbindungen über dem Kostenschwellwert",
    "Ø Gesprächszeit": "Durchschnittliche Gesprächszeit der teuersten Verbindungen",
    "Gesamte Gesprächszeit": "Gesamte Gesprächszeit aller Verbindungen über Schwellwert",
    "Gesprächszeit-Verteilung": "Verteilung der Anrufe nach Gesprächsdauer",
    "Kosten-Verteilung": "Verteilung der Anrufe nach Kosten",
    "Top Ziel-Teilnehmer": "Die teuersten Ziel-Teilnehmer nach Kosten oder Verbindungen",
    "Top Durchwahlen über Kostenschwellwert": "Durchwahlen mit den meisten Anrufen über dem Kostenschwellwert",
    "Teuerste Anrufe": "Detaillierte Liste der teuersten ausgehenden Anrufe",
    "Verpasste Anrufe": "Detaillierte Liste aller verpassten Anrufe mit Rückrufstatus",
    "Gesamtanzahl Aufzeichnungen": "Gesamtzahl der vorhandenen Anrufaufzeichnungen im Zeitraum",
    "Ø Stimmungswert": "Durchschnittlicher KI-Stimmungsanalysewert der Aufzeichnungen",
    "Stimmungswert (Verlauf)": "Zeitlicher Verlauf des Stimmungsanalysewerts",
    "Gesamtdauer": "Gesamtdauer aller Aufzeichnungen im Zeitraum",
    "Aufzeichnungen": "Detaillierte Liste aller Anrufaufzeichnungen mit Transkription",
    "CPU-Auslastung (Verlauf)": "Zeitlicher Verlauf der CPU-Auslastung der 3CX-Dienste",
    "Speicherauslastung (Verlauf)": "Zeitlicher Verlauf der Speicherauslastung der 3CX-Dienste",
    "Aktuelle CPU-Auslastung": "Aktuelle CPU-Auslastung aller 3CX-Dienste",
    "Aktuelle Speicherauslastung": "Aktueller Speicherbedarf aller 3CX-Dienste",
    "Aktuelle Festplattenauslastung": "Aktueller Festplattennutzungsgrad",
    "Aktivster Dienst": "Der 3CX-Dienst mit dem höchsten aktuellen Ressourcenverbrauch",
    "Festplattentrend": "Zeitlicher Verlauf der Festplattennutzung",
    "Netzwerkverkehr (Bytes/Sek.)": "Zeitlicher Verlauf des Netzwerkdurchsatzes",
    "Dienst-Speicherverbrauch": "Speicherverbrauch der einzelnen 3CX-Dienste über die Zeit",
    "Dienst-Thread-Anzahl": "Anzahl aktiver Threads pro 3CX-Dienst über die Zeit",
    "Dienstdetails (Verlauf)": "Detaillierter zeitlicher Verlauf aller Dienst-Metriken",
    "Ø Jitter": "Durchschnittlicher Jitter-Wert der Anrufe im Zeitraum",
    "Ø Paketverlust %": "Durchschnittlicher Paketverlust der Anrufe im Zeitraum",
    "Ø Roundtrip-Zeit (ms)": "Durchschnittliche Roundtrip-Latenz der Anrufe",
    "Qualitätswert (Verlauf)": "Zeitlicher Verlauf des MOS-Qualitätswerts",
    "Codec-Verteilung": "Übersicht der verwendeten Audio-Codecs",
    "Ø Paketverlust (Verlauf)": "Zeitlicher Verlauf des durchschnittlichen Paketverlusts",
    "Gesamtwert-Verteilung": "Verteilung der Anrufe nach MOS-Gesamtwert",
    "Anrufqualitätsbericht": "Detaillierter Qualitätsbericht aller Anrufe mit Jitter, Paketverlust und Latenz",
    "Top 100 häufigste Anrufer (nach Anzahl)": "Die 100 Rufnummern mit den meisten eingehenden Anrufen",
    "Top 100 häufigste Anrufer (nach Gesprächsdauer)": "Die 100 Rufnummern mit der längsten Gesamtgesprächsdauer",
    "Gesprächsdauer (Verlauf)": "Zeitlicher Verlauf der Gesprächsdauer häufiger Anrufer",
    "Liste eingehender Anrufe": "Detaillierte Liste aller eingehenden Anrufe der häufigsten Anrufer",
}

# ── Dauer-Panels (erhalten unit: "s") ───────────────────────────────────────

DURATION_STAT_TITLES = {
    "Gesamte Gesprächsdauer",
    "Ø Gesprächsdauer",
    "Ø Anrufdauer",
    "Längste Anrufdauer",
    "Gesprächszeit",
    "Ø Klingelzeit",
    "Gesamtdauer",
    "Eingehend Dauer",
    "Eingehend Gesprächsdauer",
    "Ausgehend Dauer",
    "Ausgehend Gesprächsdauer",
    "Ø Gesprächszeit",
    "Gesamte Gesprächszeit",
    "Ø Rückrufverzögerung [auto & manuell]",
    "Längste Rückrufverzögerung [auto & manuell]",
}

# ── Spaltenbreiten für Table-Panels ─────────────────────────────────────────

# Zuordnung: deutsch-übersetzte Spaltenname → (Breite, Ausrichtung)
# Ausrichtung: "left" | "right" | "center"
COLUMN_CONFIG = {
    "Anruf-ID":                 (80,  "left"),
    "Durchwahl":                (100, "left"),
    "Name":                     (150, "left"),
    "DID":                      (110, "left"),
    "Begonnen am":              (165, "left"),
    "Beendet am":               (165, "left"),
    "Angenommen am":            (165, "left"),
    "Startzeit":                (165, "left"),
    "Rückruf begonnen am":      (165, "left"),
    "Dauer":                    (110, "right"),
    "Gesprächsdauer":           (130, "right"),
    "Klingeldauer":             (120, "right"),
    "Rückruf Gesprächsdauer":   (160, "right"),
    "Kosten":                   (90,  "right"),
    "Abrechnungskosten":        (130, "right"),
    "Abrechnungscode":          (120, "left"),
    "Abrechnungsrate":          (120, "right"),
    "Abrechnungsratename":      (160, "left"),
    "% angenommen":             (120, "right"),
    "Externer Teilnehmer":      (190, "left"),
    "Lokaler Teilnehmer":       (180, "left"),
    "Teilnehmer (Quelle)":      (180, "left"),
    "Anrufer":                  (180, "left"),
    "Angerufener":              (180, "left"),
    "Eingehender Anrufer":      (180, "left"),
    "Wer hat zurückgerufen?":   (180, "left"),
    "Rückrufstatus":            (130, "left"),
    "Rückruftyp":               (130, "left"),
    "Rückruftyp (final)":       (130, "left"),
    "Rückrufverzögerung":       (160, "right"),
    "Rückrufreaktionszeit":     (170, "right"),
    "Ø Rückrufreaktionszeit":   (170, "right"),
    "Rückruf in 24h":           (120, "center"),
    "Rückruf begonnen am":      (165, "left"),
    "Warteschlange":            (150, "left"),
    "Eingehend [angenommen]":   (160, "right"),
    "Eingehend [nicht angenommen]": (180, "right"),
    "Ausgehend [angenommen]":   (160, "right"),
    "Ausgehend [nicht angenommen]": (180, "right"),
    "Gesamt [angenommen]":      (140, "right"),
    "Gesamt [nicht angenommen]":(160, "right"),
    "Gesprächszeit":            (130, "right"),
    "Dateiname":                (200, "left"),
    "Zusammenfassung":          (250, "left"),
    "Transkription":            (300, "left"),
    "Stimmungswert":            (120, "right"),
    "Anrufteilstrecken":        (120, "right"),
    "Anrufer-Adresse":          (180, "left"),
    "Angerufener-Adresse":      (180, "left"),
    "Modus":                    (80,  "left"),
    "Gesamtwert":               (100, "right"),
    "Gesamtzusammenfassung":    (200, "left"),
    "Anzahl Anrufe":            (110, "right"),
    "Gesamte Anrufe":           (110, "right"),
    "Eingehende Anrufe":        (130, "right"),
    "Ausgehende Anrufe":        (130, "right"),
    "Anrufe":                   (90,  "right"),
    "Speicher (MB)":            (110, "right"),
    "Dienstname":               (180, "left"),
    "Dienst":                   (150, "left"),
    "Verbindungen":             (110, "right"),
    "Verbindungen mit Kosten":  (170, "right"),
    "Gesamtkosten":             (110, "right"),
    "Teilnehmer":               (180, "left"),
    "Ziel":                     (180, "left"),
}

# Dauer-Spalten in Tables (erhalten zusätzlich unit: "s")
DURATION_COLUMNS = {
    "Dauer",
    "Gesprächsdauer",
    "Klingeldauer",
    "Rückruf Gesprächsdauer",
    "Gesprächszeit",
    "Ø Rückrufreaktionszeit",
    "Rückrufverzögerung",
}


# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

def translate(val: str) -> str:
    return TRANSLATIONS.get(val, val)


def apply_column_overrides(panel: dict) -> None:
    """Setzt Spaltenbreiten und Einheiten für Table-Panels."""
    fc = panel.setdefault("fieldConfig", {})
    overrides = fc.setdefault("overrides", [])

    # Bestehende overrides nach byName-Matcher indexieren
    existing = {}
    for ov in overrides:
        matcher = ov.get("matcher", {})
        if matcher.get("id") == "byName":
            existing[matcher["options"]] = ov

    for col_name, (width, align) in COLUMN_CONFIG.items():
        if col_name not in existing:
            entry = {
                "matcher": {"id": "byName", "options": col_name},
                "properties": []
            }
            overrides.append(entry)
            existing[col_name] = entry
        else:
            entry = existing[col_name]

        props = entry["properties"]
        prop_ids = {p["id"] for p in props}

        if "custom.width" not in prop_ids:
            props.append({"id": "custom.width", "value": width})
        if "custom.align" not in prop_ids:
            props.append({"id": "custom.align", "value": align})
        if col_name in DURATION_COLUMNS and "unit" not in prop_ids:
            props.append({"id": "unit", "value": "s"})


def process_panel(panel: dict) -> None:
    old_title = panel.get("title", "")
    new_title = translate(old_title)
    panel["title"] = new_title

    # Beschreibung setzen wenn noch leer
    if not panel.get("description") and new_title in DESCRIPTIONS:
        panel["description"] = DESCRIPTIONS[new_title]

    # Markdown-Header übersetzen
    if panel.get("type") == "text":
        opts = panel.setdefault("options", {})
        content = opts.get("content", "")
        opts["content"] = translate(content)

    # RenameByName-Werte übersetzen
    for transform in panel.get("transformations", []):
        if transform.get("id") == "organize":
            rename = transform.get("options", {}).get("renameByName", {})
            for k in rename:
                if rename[k]:  # leere Strings nicht anfassen
                    rename[k] = translate(rename[k])

    # Einheit für Dauer-Stat-Panels
    if panel.get("type") == "stat" and new_title in DURATION_STAT_TITLES:
        fc = panel.setdefault("fieldConfig", {})
        defaults = fc.setdefault("defaults", {})
        if "unit" not in defaults:
            defaults["unit"] = "s"

    # Spaltenbreiten für Table-Panels
    if panel.get("type") == "table":
        apply_column_overrides(panel)


def process_file(path: str) -> int:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    changes = 0

    # Root-Titel
    old = data.get("title", "")
    new = translate(old)
    if new != old:
        data["title"] = new
        changes += 1

    # Panels (inkl. Row-Sub-Panels)
    for panel in data.get("panels", []):
        before = json.dumps(panel)
        process_panel(panel)
        for sub in panel.get("panels", []):
            process_panel(sub)
        if json.dumps(panel) != before:
            changes += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    return changes


# ── Hauptprogramm ────────────────────────────────────────────────────────────

def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dirs = [
        os.path.join(base, "postrge"),
        os.path.join(base, "tcx-3cx-app", "dashboards", "postrge"),
        os.path.join(base, "tcx-3cx-app", "dashboards", "mysql"),
        os.path.join(base, "tcx-3cx-app", "dashboards", "mssql"),
        os.path.join(base, "tcx-3cx-app", "dashboards", "big-query"),
    ]

    total_files = 0
    total_changes = 0

    for d in dirs:
        files = sorted(glob.glob(os.path.join(d, "*.json")))
        if not files:
            print(f"  (keine Dateien in {d})")
            continue
        print(f"\n📁 {os.path.relpath(d, base)}")
        for f in files:
            changes = process_file(f)
            icon = "✓" if changes else "–"
            print(f"  {icon} {os.path.basename(f)}  ({changes} Änderungen)")
            total_files += 1
            total_changes += changes

    print(f"\n✅ Fertig: {total_files} Dateien, {total_changes} Panels geändert")


if __name__ == "__main__":
    main()

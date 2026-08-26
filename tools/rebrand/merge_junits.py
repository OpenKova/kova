#!/usr/bin/env python3
"""Merge per-chunk junit XMLs into one baseline file."""
import glob, sys, xml.etree.ElementTree as ET

parts_dir = r"C:\Users\chira\kova-agent\tools\rebrand\baseline_parts"
out_path = r"C:\Users\chira\kova-agent\tools\rebrand\baseline_junit.xml"

merged = ET.Element("testsuites", {"name": "pytest baseline (merged)"})
T=F=E=S=0
for p in sorted(glob.glob(parts_dir + "/*.xml")):
    try:
        root = ET.parse(p).getroot()
    except ET.ParseError:
        print("SKIP corrupt:", p); continue
    suites = [root] if root.tag == "testsuite" else root.findall("testsuite")
    for s in suites:
        merged.append(s)
        T += int(s.get("tests", 0)); F += int(s.get("failures", 0))
        E += int(s.get("errors", 0)); S += int(s.get("skipped", 0))
ET.ElementTree(merged).write(out_path, encoding="utf-8", xml_declaration=True)
print(f"merged -> {out_path}\ntests={T} failures={F} errors={E} skipped={S}")

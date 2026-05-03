#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""בדיקה קצרה: פתיחת WhatsApp למק (אפליקציה) בלי דפדפן."""

import subprocess
import urllib.parse

phone = "972585661813"
text = "בדיקה"
url = "whatsapp://send?" + urllib.parse.urlencode(
    {"phone": phone, "text": text},
    quote_via=urllib.parse.quote,
)

print("מנסה לפתוח WhatsApp...")
subprocess.run(["open", url], check=False)

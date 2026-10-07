import re


def _name_key(name):
    return re.sub(r'[^\w]', '', str(name).casefold())


def with_create_attribute_defaults(attributes, profile):
    if profile not in {'jv', 'xl'}:
        return attributes
    brand = 'JVmoebel®' if profile == 'jv' else 'XLmoebel'
    defaults = {
        'Art Herstellung': 'Fertigung aus Europa',
        'Geschlecht': 'Unisex',
        'Hinweis Maßangaben': 'Alle Angaben sind ca. Maße',
        'Informationen zur Datennutzung (nach EU Data Act)': (
            'Ihre personenbezogenen Daten werden nur zur Bearbeitung Ihrer Bestellungen, '
            'für Marketing (mit Zustimmung) und zur Kundenbetreuung verwendet. Sie haben jederzeit '
            'das Recht auf Auskunft, Berichtigung oder Löschung Ihrer Daten. Weitere Informationen '
            'finden Sie in unserer Datenschutzerklärung.'
        ),
        'Marke laut BattVO': 'JVMOEBEL' if profile == 'jv' else 'XLMOEBEL',
        'Markeninformation': (
            f'{brand} ist seit Jahrzehnten bekannt für hochwertige, stilvolle Möbel. Mit einem Fokus '
            'auf Design, Qualität und Nachhaltigkeit bietet die Marke maßgeschneiderte Lösungen für jedes Zuhause.'
        ),
        'Pflegehinweise': 'keine aggressiven Reinigungsmittel verwenden',
        'Hinweis Lieferumfang': (
            'Es wird alles geliefert, was in der Produktbeschreibung angegeben ist. '
            'Die Dekoration und Beimöbel sind nicht im Lieferumfang enthalten'
        ),
        'WEEE-Reg. Nr.': '46974041' if profile == 'jv' else '80120806',
        'Wissenswert': (
            'Falls der Artikel nicht Ihrem Farbwunsch entspricht oder die Farbe unpassend ist, '
            'können Sie gerne bei uns eine Maßanfertigung oder Farbänderung anfragen.'
        ),
        'Warnhinweise': (
            'Wir liefern den Artikel kostenlos bis zur Bordsteinkante. Optional bietet die Spedition '
            'jedoch auch einen 2-Mann-Service sowie einen Montageservice an. Diesen Service können Sie '
            'direkt bei der Spedition bei der Anlieferung anfragen. Es besteht die Möglichkeit einer '
            '2-Mann-Lieferung sowie der Montage des Artikels.'
        ),
        'Farbhinweise': 'Bitte beachten Sie, dass die Farben auf Ihrem Monitor von den Originalfarbtönen abweichen können.',
        'Materialhinweis': (
            f'{brand} erfüllt alle relevanten CE-Normen und gewährleistet, dass unsere Möbel höchste '
            'Sicherheits- und Qualitätsstandards einhalten. Unsere Produkte entsprechen der '
            'Produktsicherheitsrichtlinie (2001/95/EG) sowie den spezifischen Sicherheitsanforderungen '
            'der EN 12520:2015, EN 1022:2005 und EN 14749:2016. Zudem werden alle Materialien gemäß '
            'der REACH-Verordnung und RoHS-Richtlinien auf Schadstoffe geprüft. Unsere Möbel bieten '
            'nicht nur hohe Qualität, sondern auch eine umweltfreundliche Produktion, die durch ISO 9001 '
            'und ISO 14001 unterstützt wird. Alle Möbel entsprechen auch den ergonomischen und '
            'stabilitätsrelevanten Anforderungen der EN 1335 und erfüllen gegebenenfalls die '
            'Brandschutzanforderungen der B1-Klasse.'
        ),
    }
    values = {_name_key(name): value for name, value in defaults.items()}
    values[_name_key('Markeninformationen')] = defaults['Markeninformation']
    values[_name_key('WEE-Reg. Nr.')] = defaults['WEEE-Reg. Nr.']
    values[_name_key('Hinweß Lieferumfang')] = defaults['Hinweis Lieferumfang']
    result = []
    for attribute in attributes:
        item = dict(attribute)
        name = item.get('name') or item.get('attributeKey') or ''
        value = values.get(_name_key(name))
        if value:
            allowed = item.get('allowedValues') or []
            if allowed:
                value = next((str(option) for option in allowed if str(option).casefold() == value.casefold()), None)
            if value:
                item['defaultValue'] = value
        result.append(item)
    return result

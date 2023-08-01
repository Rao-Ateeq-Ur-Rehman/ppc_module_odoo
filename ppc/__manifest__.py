# -*- coding: utf-8 -*-
{
    'name': 'PPC',
    'sequence': 0,
    'author': 'Ateeq Ur Rehman',
    'version': '0.0.0.1',
    'category': 'Production Planning',
    'summary': 'PPC ERP Module',
    'description': """PPC ERP Module""",
    'depends': ['base', 'mail', 'web', 'web_notify'],
    'data': [
        'C:/Edraak/Odoo main/odoo project 2/custom_modules/ppc/security/ir.model.access.csv',
        'C:/Edraak/Odoo main/odoo project 2/custom_modules/ppc/views/ppc_view.xml',
        'C:/Edraak/Odoo main/odoo project 2/custom_modules/ppc/security/ppc_security.xml',
        'C:/Edraak/Odoo main/odoo project 2/custom_modules/ppc/views/classification.xml',
        'C:/Edraak/Odoo main/odoo project 2/custom_modules/ppc/views/customers.xml',
    ],
    'demo': [],
    'application':True,
    'installable': True,
    'auto_install': False,
    'assets': {
        'web.assets_backend': [
            'ppc/static/css_main/css_main.css',
            'ppc/static/src/ppc_order_view/js/ppc_order_view.js',
            'ppc/static/src/ppc_order_view/xml/ppc_order_view.xml',
            'ppc/static/src/ppc_order_view/css/ppc_order_view.css',
            'ppc/static/src/approve_ppc_orders/js/approve_ppc_orders.js',
            'ppc/static/src/approve_ppc_orders/xml/approve_ppc_orders.xml',
            'ppc/static/src/get_excel_data/js/get_excel_data.js',
            'ppc/static/src/get_excel_data/xml/get_excel_data.xml',
            'ppc/static/src/get_excel_data/css/get_excel_data.css',
        ],
    },
    'license': 'LGPL-3'
}

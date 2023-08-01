from odoo import models, fields, api, registry, SUPERUSER_ID, sql_db, http, tools
import json, odoo, uuid, time, io
from odoo.http import request, Response
import pandas as pd
import numpy as np
import pyodbc


class ExcelData(http.Controller):
    @http.route('/ppc/get_csrf_token', type='http', auth='public', csrf=False)
    def get_csrf_token(self, **post):
        csrf_token = request.csrf_token()
        return Response(json.dumps({'csrf_token': csrf_token}), content_type='application/json')

    @http.route('/ppc/upload_excel_file', type='http', auth='public', csrf=False)
    def upload_excel_file(self, **post):
        # Get the uploaded file and CSRF token
        uploaded_file = request.httprequest.files.get('file')
        csrf_token = post.get('csrf_token')
        if uploaded_file and csrf_token:
            # Check if the file is of Excel type
            allowed_file_types = ['application/vnd.ms-excel',
                                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
            if uploaded_file.content_type in allowed_file_types:
                print('File is of Excel type')

                # Read the Excel file using pandas
                df = pd.read_excel(uploaded_file)

                # Convert DataFrame to JSON with formatting
                data = []
                for row in df.itertuples(index=False):
                    row_dict = {}
                    for idx, value in enumerate(row):
                        if pd.api.types.is_datetime64_any_dtype(df.dtypes[idx]):
                            # Format date as string if present, otherwise write null
                            value = value.strftime('%Y-%m-%d') if not pd.isnull(value) else None
                        elif pd.isna(value) or (isinstance(value, str) and value.strip() == ''):
                            # Replace empty or whitespace-only values with None
                            value = None
                        row_dict[df.columns[idx]] = value
                    data.append(row_dict)

                df_json = json.dumps(data)
                return df_json
            else:
                print('Invalid file type. Only Excel files are allowed.')
                return json.dumps({'success': False, 'message': 'Invalid file type. Only Excel files are allowed.'})
        else:
            return json.dumps({'success': False, 'message': 'Invalid file or CSRF token'})


class PpcOrderView(http.Controller):
    @http.route('/api/ppc_order_view/get_model_fields', type='http', auth='user', methods=['POST'], csrf=False)
    def get_model_fields(self, **kw):
        try:
            model = http.request.env['order.data']
            fields = model.fields_get()
            return http.Response(json.dumps({'fields': fields}), content_type='application/json')
        except Exception as e:
            return http.Response(json.dumps({'error': str(e)}), content_type='application/json', status=500)


class PpcModel(models.Model):
    _name = "order.data"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _description = "Order Data"

    ppLot = fields.Integer(string='PP Lot Number')
    fabricType = fields.Selection([('flat', 'Flat'), ('lycra', 'Lycra'), ('cotton', 'Cotton'), ('silk', 'Silk')], string='Fabric Type', required=True)
    status = fields.Char(string='Status')
    urgencyStatus = fields.Selection([('redAlert', 'Red Alert'), ('orderLate', 'Order Late'), ('dispatchDate','Dispatch Date')], string='Urgency Status', required='True')
    placement_date = fields.Date(string='Order Placement Date')
    dispatch_date = fields.Date(string='Order Dispatch Date')
    finish = fields.Char(string='Fabric Finish')
    orderNumber = fields.Integer(string='order Number')
    articleNumber = fields.Integer(string='Article Number')
    greyLotNumber = fields.Integer(string='Grey Lot Number')
    color = fields.Char(string='Color')
    construction = fields.Char(string='Construction')
    weave = fields.Char(string='Weave')
    greigeWidth = fields.Integer(string='Greige Width')
    finishedGreigeWidth = fields.Integer(string='Finished Greige Width')
    rel = fields.Integer(string='Rel')
    tol = fields.Integer(string='Tol')
    requiredQuantity = fields.Integer(string='Required Quantity')
    totalRequiredQuantity = fields.Integer(string='Total Required Quantity')
    meters = fields.Integer(string='Meters')
    supplier = fields.Char(string='Supplier')
    sourceWeft = fields.Char(string='Source Weft')
    sourceWarp = fields.Char(string='Source Warp')
    sequence = fields.Integer(string='Sequence')
    classification_name = fields.Char(string='Order Classification', related='classification.classification_name', store=True)
    classification = fields.Many2one('order.classification', string='Classification Name', store=True)
    customers = fields.Many2one('customers', string='Customer Name')
    remarks = fields.Char(string='Remarks')
    machineRoute = fields.Char(string='Machine Route')

    # Function to save form for custom save button.
    @api.model
    def action_save(self):
        self.write({})  # Save the form data
        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }

    def save_data(self):
        # This is for getting fabric type of the submitted form
        fabric_type = self.fabricType  # Get the selected fabricType value
        classification_name = self.classification_name
        print("Selected Fabric Type: ", fabric_type)
        print("Selected Classification Name: ", classification_name)

        # This is for getting urgency Status of the submitted form
        urgency_status = self.urgencyStatus
        print("Selected Urgency Status: ", urgency_status)

        # This is for getting sequences of the same fabric Type as the submitted form
        sequences_classification_name = self.env['order.data'].sudo().search([('classification_name', '=', classification_name)],
                                                                     order='sequence')
        sequence_values_classification_name = [record.sequence for record in sequences_classification_name]
        print("Sequence Values:", sequence_values_classification_name)

        # This is for getting the max sequence of the same fabric Type as the submitted form
        max_sequence_value_classification_name = max(sequence_values_classification_name) if sequence_values_classification_name else 0
        print("Max Sequence Value (Fabric Type):", max_sequence_value_classification_name)

        found_more_urgency = False
        red_alert_sequence_values = []

        # Check if urgency_status is 'redAlert'
        if urgency_status == 'redAlert':
            print("Found Red Alert")
            for record in sequences_classification_name:
                if record != self and record.urgencyStatus == 'redAlert':
                    found_more_urgency = True
                    red_alert_sequence_values.append(record.sequence)

            if found_more_urgency:
                print("Found More Urgency Status")
                print("red_alert_sequence_values: ", red_alert_sequence_values)
                print("max, red_alert_sequence_values: ", max(red_alert_sequence_values))
                red_alert_final_value = max(red_alert_sequence_values)
                red_alert_final_value = red_alert_final_value + 1
                self.sequence = red_alert_final_value

                for record in sequences_classification_name:
                    if record != self and record.urgencyStatus != 'redAlert':
                        record.sequence += 1


            else:
                print("No More Urgency Status")
                # Set the 'sequence' value to 1
                self.sequence = 1
                # Increment all the sequence values of the same fabric type by 1
                for record in sequences_classification_name:
                    if record != self:
                        record.sequence += 1

        else:
            print("Did not Found Red Alert")
            # Get the max sequence value from the table that is of the same fabric type and set the sequence of the newly added
            sequences = self.search([], order='sequence')
            sequence_values = [record.sequence for record in sequences]
            max_sequence_value = max_sequence_value_classification_name + 1 if sequence_values else 1
            # Update the sequence value for the current record
            self.sequence = max_sequence_value

        self.status = 'PPC Operator'
        self.env.user.notify_success("Data saved successfully!")

        action = self.env.ref('ppc.ppc_order_view_action', raise_if_not_found=False)
        if action:
            return action.read()[0]
        else:
            return self.env['ir.actions.act_window'].read()[0]


class Classification(models.Model):
    _name = "order.classification"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _description = "Order Classification"

    classification_name = fields.Char(string='Classification Name')

    def name_get(self):
        result = []
        for record in self:
            name = record.classification_name
            result.append((record.id, name))
        return result

    def addClassification(self):
        existing_classification = self.env['order.classification'].search(
            [('classification_name', '=', self.classification_name)], limit=1)
        if existing_classification:
            print("Classification already exists:", existing_classification.classification_name)
        else:
            new_classification = self.create({'classification_name': self.classification_name})
            print("Classification saved:", new_classification.classification_name)


class Customers(models.Model):
    _name = "customers"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _description = "Customers"

    name = fields.Char(string='Customer Name')


class OrderOperations(models.Model):
    _name= "order.operations"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _description = "Order Operations"

    status = fields.Char(string='Order status')





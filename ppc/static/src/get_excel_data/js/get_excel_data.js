/** @odoo-module **/
import { registry } from '@web/core/registry';
const { Component, useState, onWillStart } = owl;
import { useService } from "@web/core/utils/hooks";
import { hooks,  PatchMixin  } from '@odoo/owl';
import { useModel } from '@odoo/owl';

export class GetExcelData extends Component{
  setup() {
    this.orm = useService("orm");
    this.state = useState({
      fieldNames: [], // All required fields/columns and their names as well
      excelData: [],
      fields: {},
      orderData: [],
      alignedOrderData: [],
      ppLotDuplicateValue: [],
      classifications: [],
    });
    onWillStart(async () => {
        const fields = await this.fetchModelFields();
        this.state.fields = fields;
                    // Unwanted fields
            const excludedFields = ['message_main_attachment_id', 'create_uid', 'write_uid', 'create_date', 'write_date', 'activity_date_deadline', 'activity_exception_decoration', 'activity_exception_icon', 'activity_ids', 'activity_state', 'activity_summary', 'activity_type_icon', 'activity_type_id', 'activity_user_id', "my_activity_date_deadline", "message_is_follower", "message_follower_ids",
                                    "message_follower_ids", "message_partner_ids","message_ids","has_message","message_needaction","message_needaction_counter","message_has_error","message_has_error_counter", "message_attachment_count", "message_has_sms_error", "website_message_ids", "__last_update", "display_name", "classification", "urgencyStatus", "classification_name", "id" , "machineRoute" ];
            const filteredFields = Object.keys(this.state.fields)
                .filter(fieldName => !excludedFields.includes(fieldName))
                .map(fieldName => ({
                    name: fieldName,
                    actualName: this.state.fields[fieldName].string,
                }));
            this.state.fieldNames = filteredFields;
            console.log("fieldNames: ", this.state.fieldNames);

        const orderData = await this.fetchOrderData();
        this.state.orderData = orderData;

        const alignedOrderData = this.alignOrderDataByClassificationType(orderData);
        this.state.alignedOrderData = alignedOrderData;

        this.fetchClassificationNames();
    });
    this.state.notification =useService("notification");
    this.handleFileUpload = this.handleFileUpload.bind(this);
    this.changeExcelData = this.changeExcelData.bind(this);
    this.upload_data = this.upload_data.bind(this);
    this.fetchClassificationNames = this.fetchClassificationNames.bind(this);

  }

    fetchClassificationNames() {
      this.orm
        .searchRead('order.classification', [], ['classification_name'])
        .then((result) => {
          if (result && result.length > 0) {
            this.state.classifications = result.map((record) => record.classification_name);
            console.log('Classification names fetched successfully:', this.state.classifications);
          } else {
            console.error('No records found in the result:', result);
          }
        })
        .catch((error) => {
          console.error('Error fetching classification names:', error);
        });
    }

      alignOrderDataByClassificationType(orderData) {
        const alignedData = {};
        for (const order of orderData) {
            if (order.status === 'PPC Manager') { // Filter orders by status
                const classification_name = order.classification_name;
                if (!alignedData.hasOwnProperty(classification_name)) {
                    alignedData[classification_name] = [];
                }
                alignedData[classification_name].push(order);
            }
        }
        // Sort the orders within each classification_name group based on sequence
        for (const key in alignedData) {
            alignedData[key].sort((a, b) => a.sequence - b.sequence);
        }
        return Object.entries(alignedData).map(([key, value]) => ({ key, value }));
    }


        async fetchModelFields() {
        const response = await fetch('/api/ppc_order_view/get_model_fields', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const result = await response.json();
        return result.fields;
    }
    async fetchOrderData() {
        const fieldNames = this.state.fieldNames.map(field => field.name);
        const orderData = await this.orm.searchRead('order.data', [], fieldNames);
        return orderData;
    }

    generateRandomNumber() {
        const randomNum = Math.floor(Math.random() * 100000000000);
        return randomNum;
    }


 handleFileUpload() {
  const fileInput = document.getElementById('fileUploadInput');
  const file = fileInput.files[0]; // Get the selected file

  if (file) {
    if (
      file.type === 'application/vnd.ms-excel' ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      fetch('/ppc/get_csrf_token', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then((response) => response.json())
        .then((data) => {
          const csrfToken = data.csrf_token;
          console.log('CSRF Token:', csrfToken);

          const formData = new FormData();
          formData.append('file', file);
          formData.append('csrf_token', csrfToken);

          fetch('/ppc/upload_excel_file', {
            method: 'POST',
            body: formData,
          })
            .then((response) => response.text())
            .then((result) => {
              // Parse the JSON string back to a JavaScript object
              const df = JSON.parse(result);
              console.log('DataFrame:', df);

              // Transform df to the desired format
              const excelData = {};
              df.forEach((obj) => {
                for (const key in obj) {
                  let value = obj[key];
                  if (typeof value === 'number' && isNaN(value)) {
                    value = null;
                  } else if (typeof value === 'string' && value.toLowerCase() === 'none') {
                    value = null;
                  }

                  if (excelData.hasOwnProperty(key)) {
                    excelData[key].push(value);
                  } else {
                    excelData[key] = [value];
                  }
                }
              });
              console.log('excelData:', excelData);

              const fieldNames = this.state.fieldNames;
              const fieldsHeaders = Object.values(fieldNames).map(obj => obj.name);
              const excelDataHeaders = Object.keys(excelData);

              const areHeadersEqual = fieldsHeaders.length === excelDataHeaders.length &&
                fieldsHeaders.every(header => excelDataHeaders.includes(header));

              console.log("Are headers equal?", areHeadersEqual);
              console.log('this.state.fieldNames:', fieldNames);

              if (!areHeadersEqual) {
                this.state.notification.add("Selected Excel file doesn't match with template.", {
                  title: 'Error',
                  type: 'danger',
                });
                return; // End the function
              }

              this.state.excelData = excelData;

              // Continue with the rest of the code if headers are equal

            })
            .catch((error) => {
              console.error('Error uploading file:', error);
              // Display an error message or take appropriate action
            });
        })
        .catch((error) => {
          console.error('Error retrieving CSRF token:', error);
          // Display an error message or take appropriate action
        });
    } else {
      console.log('Invalid file type. Only Excel files are allowed.');
    }
  } else {
    console.log('No file selected');
    this.state.notification.add("No Excel File Selected", {
      title: 'Error',
      type: 'danger',
    });
  }
}

async changeExcelData(event, key, nestedKey) {
  const updatedValue = event.target.value;
  const originalValue = this.state.excelData[key][nestedKey];
  const columnName = event.target.getAttribute('column-name');

  // Update the value in the state
  this.state.excelData[key][nestedKey] = updatedValue;

  console.log('Updated record:', updatedValue);
  console.log('Column name:', columnName);

  // Fetch all values of ppLot from order.data table
  if (columnName === 'ppLot') {
    const allPpLots = await this.orm.searchRead('order.data', [], ['ppLot']);
    const ppLotValues = allPpLots.map(record => String(record.ppLot));
    console.log('ppLotValues:', ppLotValues);

    // Count occurrences of the updatedValue in ppLotValues array
    const duplicateCount = ppLotValues.filter(value => String(value) === String(updatedValue)).length;

    console.log('duplicateCount:', duplicateCount);

    // Find the corresponding row element and update the class and checkbox disabled state
    const rowElement = event.target.closest('.excel_data_table_rows');
    console.log('rowElement:', rowElement);
    if (rowElement) {
      const tableRow = rowElement.closest('tr');
      const checkbox = tableRow.querySelector('.excel_data_table_rows input[type="checkbox"]');
      if (duplicateCount > 0) {
        tableRow.classList.add('highlighted');
        checkbox.disabled = true; // Disable the checkbox
      } else {
        tableRow.classList.remove('highlighted');
        checkbox.disabled = false; // Enable the checkbox
      }
    }

    // Update the state with the duplicateCount
    this.state.duplicateCount = duplicateCount;
  }

  // Trigger a re-render by calling the render method
  this.render();
}

upload_data() {
  const fieldNames = Object.keys(this.state.excelData);
  const uniquePPLots = new Set(); // Set to store unique PP Lot numbers
  const existingPPLots = new Set(this.state.orderData.map((order) => order.ppLot)); // Collect existing PP Lot numbers from orderData

  const checkedRows = []; // Array to store checked rows
  const checkboxElements = document.querySelectorAll('.excel_data_table_rows input[type="checkbox"]');
  checkboxElements.forEach((checkbox, i) => {
    if (checkbox.checked) {
      const ppLotNum = this.state.excelData['ppLot'][i];
      checkedRows.push(ppLotNum);
    }
  });

  console.log('Checked rows:', checkedRows);

  const createRecordSequentially = (i) => {
    if (i < this.state.excelData[fieldNames[0]].length) {
      const ppLotNum = this.state.excelData['ppLot'][i];

      // Check if the current PP Lot number is unique and not present in orderData
      if (!uniquePPLots.has(ppLotNum) && !existingPPLots.has(ppLotNum) && checkboxElements[i].checked) {
        uniquePPLots.add(ppLotNum); // Add the PP Lot number to the set

        const values = {};
        for (const fieldName of fieldNames) {
          values[fieldName] = this.state.excelData[fieldName][i];
        }
        const urgencyStatusSelector = document.getElementById(`urgencyStatusSelector-${i}`); // Get the select element for the current row

        if (urgencyStatusSelector) {
          // Set the 'urgencyStatus' field value from the select element's value attribute
          values['urgencyStatus'] = urgencyStatusSelector.value;

          const selectedUrgencyStatus = values['urgencyStatus'];

          console.log('urgency:', selectedUrgencyStatus);

          const classificationSelector = document.getElementById(`classificationSelector-${i}`); // Get the select element for classification
          const classification_name_value = classificationSelector.value;
          console.log('classification_name_value:', classification_name_value);

          // Find the matching classification in order.classification table
          this.orm
            .searchRead('order.classification', [['classification_name', '=', classification_name_value]], ['id'])
            .then((result) => {
              if (result && result.length > 0) {
                const matchingId = result[0].id;
                console.log('Matching classification ID:', matchingId);
                values['classification'] = matchingId; // Set matchingId as the 'classification' field value
                // Use the ID for further operations if needed

                // Search for sequence values with the same classification
                return this.orm.searchRead('order.data', [['classification', '=', matchingId]], ['sequence', 'urgencyStatus']);
              } else {
                console.log('No matching classification found for:', classification_name_value);
                return []; // Return an empty array if no matching classification is found
              }
            })
            .then((sequenceResult) => {
              console.log('sequenceResult:', sequenceResult);
              const redAlertSequenceValues = sequenceResult
                .filter((sequence) => sequence.urgencyStatus === 'redAlert')
                .map((sequence) => sequence.sequence);

              const maxRedAlertSequence = Math.max(...redAlertSequenceValues);
              const maxSequence = Math.max(...sequenceResult.map((sequence) => sequence.sequence));
              const nextSequence = (selectedUrgencyStatus === 'redAlert') ? maxRedAlertSequence + 1 : maxSequence + 1;

              values['sequence']= (sequenceResult.length === 0) ? 1 : nextSequence;

              // Increment sequence values higher than the newly added row
              const classificationSequenceValues = sequenceResult
                .filter((sequence) => sequence.sequence >= values['sequence'])
                .map((sequence) => sequence.id);

              if (classificationSequenceValues.length > 0) {
                const updatePromises = classificationSequenceValues.map((sequenceId) => {
                  // Retrieve the current sequence value
                  return this.orm
                    .searchRead('order.data', [['id', '=', sequenceId]], ['sequence'])
                    .then((records) => {
                      if (records && records.length > 0) {
                        const currentSequence = records[0].sequence;
                        const updatedSequence = currentSequence + 1;

                        // Update the record with the incremented sequence value
                        return this.orm.call('order.data', 'write', [[sequenceId], { sequence: updatedSequence }]);
                      }
                    });
                });

                return Promise.all(updatePromises);
              }
            })
            .then(() => {
              // Use the ORM to create the record
              return this.orm.create('order.data', [values]); // Wrap values in an array
            })
            .then(() => {
              console.log('Record created successfully:', values);
              return createRecordSequentially(i + 1); // Process the next record
            })
            .catch((error) => {
              console.error('Error creating or updating record:', error);
              // Handle error case, e.g., display an error message
              return createRecordSequentially(i + 1); // Process the next record
            });
        } else {
          console.error(`urgencyStatusSelector-${i} not found.`);
          createRecordSequentially(i + 1); // Process the next record
        }
      } else {
        createRecordSequentially(i + 1); // Process the next record
      }
    } else {
      // All records processed
      console.log('All unique records created successfully');
      this.state.notification.add('Data Upload Successfully', {
        title: 'Success',
        type: 'success',
      });
    }
  };

  // Start creating records sequentially
  createRecordSequentially(0);
}

}
GetExcelData.template = 'ppc.GetExcelDataTemplate';
registry.category('actions').add('ppc.get_excel_data_js', GetExcelData);

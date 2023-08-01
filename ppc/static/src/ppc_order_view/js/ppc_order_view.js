/** @odoo-module **/
import {registry, bus, services } from '@web/core/registry';
const { Component, useState, onWillStart } = owl;
import { useService } from "@web/core/utils/hooks";
import { hooks } from '@odoo/owl';
import { useModel } from '@odoo/owl';

export class PpcOrderView extends Component {
    setup() {
        this.orm = useService("orm");
        this.state = useState({
            fieldNames: [], // All required fields/columns and their names as well
            fields: {},
            orderData: [],
            alignedOrderData: [],
        });
        onWillStart(async () => {
            const fields = await this.fetchModelFields();
            this.state.fields = fields;
            console.log( 'fields : ', fields)

            // Unwanted fields
            const excludedFields = ['message_main_attachment_id', 'create_uid', 'write_uid', 'create_date', 'write_date', 'activity_date_deadline', 'activity_exception_decoration', 'activity_exception_icon', 'activity_ids', 'activity_state', 'activity_summary', 'activity_type_icon', 'activity_type_id', 'activity_user_id', "my_activity_date_deadline", "message_is_follower", "message_follower_ids",
                                    "message_follower_ids", "message_partner_ids","message_ids","has_message","message_needaction","message_needaction_counter","message_has_error","message_has_error_counter", "message_attachment_count", "message_has_sms_error", "website_message_ids", "__last_update", "display_name", "machineRoute" ];
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
            console.log("orderData: ", this.state.orderData);

            const alignedOrderData = this.alignOrderDataByClassificationType(orderData);
            this.state.alignedOrderData = alignedOrderData;
            console.log("alignedOrderData: ", this.state.alignedOrderData);

        });
        this.changeUrgencyStatus = this.changeUrgencyStatus.bind(this);
        this.typingCompleted = this.typingCompleted.bind(this);
        this.onDrop = this.onDrop.bind(this);
        this.onDragStart = this.onDragStart.bind(this);
        this.onDragOver = this.onDragOver.bind(this);
        this.state.notification =useService("notification");
    }
    onDragStart(ev, orderId) {
        ev.dataTransfer.setData("text/plain", orderId); // Set the ID of the selected row as data
    }
    onDragOver(ev) {
        ev.preventDefault(); // Prevent the default behavior of the browser
    }

    alignOrderDataByClassificationType(orderData) {
        const alignedData = {};
        for (const order of orderData) {
            const classification_name = order.classification_name;
            if (!alignedData.hasOwnProperty(classification_name)) {
                alignedData[classification_name] = [];
            }
            alignedData[classification_name].push(order);
        }
        console.log('alignedData: ', alignedData);
        // Sort the orders within each classification_name group based on sequence
        for (const key in alignedData) {
            alignedData[key].sort((a, b) => a.sequence - b.sequence);
        }
        return Object.entries(alignedData).map(([key, value]) => ({ key, value }));
    }


async onDrop(ev) {
  ev.preventDefault(); // Prevent the default behavior of the browser
  const sourceRowId = ev.dataTransfer.getData("text/plain"); // Retrieve the ID of the selected row
  const targetRowId = ev.target.parentNode.getAttribute("data-row-id"); // Get the ID of the target row

  // Find the selected row and the target row in the DOM
  const sourceRow = document.querySelector(`[data-row-id="${sourceRowId}"]`);
  const targetRow = document.querySelector(`[data-row-id="${targetRowId}"]`);

  // Get the sequence values of the selected row and the target row
  const sourceSequence = parseInt(sourceRow.getAttribute("data-sequence"));
  const targetSequence = parseInt(targetRow.getAttribute("data-sequence"));

  // Get the classification_name of the selected row and the target row
  const sourceClassification = sourceRow.getAttribute("data-classification-name");
  const targetClassification = targetRow.getAttribute("data-classification-name");

  console.log('sourceClassification: ', sourceClassification);
  console.log('targetClassification: ', targetClassification);

  // Check if the selected order and target have the same classification_name
  if (sourceClassification === targetClassification) {
    // Swap the sequence values
    sourceRow.setAttribute("data-sequence", targetSequence);
    targetRow.setAttribute("data-sequence", sourceSequence);

    // Update the sequence values in the database using ORM
    const sourceOrderId = parseInt(sourceRowId);
    const targetOrderId = parseInt(targetRowId);

    // Update the sequence values in the order.data model using Odoo's ORM
    await this.orm.call('order.data', 'write', [[sourceOrderId], { sequence: targetSequence }]);
    await this.orm.call('order.data', 'write', [[targetOrderId], { sequence: sourceSequence }]);

    // Fetch the updated order data and realign the table
    const orderData = await this.fetchOrderData();
    const alignedOrderData = this.alignOrderDataByClassificationType(orderData);
    this.state.orderData = orderData;
    this.state.alignedOrderData = alignedOrderData;
    this.state.notification.add('Sequence Changed.', {
      title: 'Success',
      type: 'success',
    });
  } else {
    this.state.notification.add("Selected and target must have the same Classification", {
      title: 'Error',
      type: 'danger',
    });
  }
}


    async fetchModelFields() {
        const response = await fetch('/api/ppc_order_view/get_model_fields', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const result = await response.json();
        console.log('result : ', result);

        return result.fields;
    }

    async fetchOrderData() {
        const fieldNames = this.state.fieldNames.map(field => field.name);
        const orderData = await this.orm.searchRead('order.data', [], fieldNames);
        orderData.forEach(data => {
            if (data.customers && Array.isArray(data.customers) && data.customers.length >= 2) {
                data.customers = data.customers[1];
            }
        });
        return orderData;
    }
    async typingCompleted(orderId, event) {
        const updatedInput = event.target.value;
        try {
        const result = await this.orm.call('order.data', 'write', [[orderId], { remarks: updatedInput }]);
        if (result) {
            console.log('Remarks updated successfully');
        } else {
            console.error('Error occurred while updating remarks');
        }
        } catch (error) {
        }
    }
    async changeUrgencyStatus(orderId, event) {
        // Retrieve the order record from the orderData array
        const order = this.state.orderData.find(order => order.id === orderId);
        if (order) {
            if ((order.urgencyStatus === 'orderLate' || order.urgencyStatus === 'dispatchDate') && event.target.value === 'redAlert') {
                // Retrieve the max sequence value with urgencyStatus 'redAlert' for the same classification_name
                const maxSequence = this.state.orderData
                    .filter(otherOrder => otherOrder.classification_name === order.classification_name && otherOrder.urgencyStatus === 'redAlert')
                    .reduce((max, otherOrder) => (otherOrder.sequence > max ? otherOrder.sequence : max), -Infinity);
                const newSequence = maxSequence + 1;
                // Increment sequence values higher than maxSequence for orders with the same classification_name
                this.state.orderData
                    .filter(otherOrder => otherOrder.classification_name === order.classification_name && otherOrder.sequence > maxSequence && otherOrder.id !== order.id)
                    .forEach(otherOrder => {
                        otherOrder.sequence++;
                    });
                try {
                    // Update the sequence value in the order.data model using Odoo's ORM
                    await this.orm.call('order.data', 'write', [[order.id], { sequence: newSequence, urgencyStatus: 'redAlert' }]);

                    // Update the sequence values in the order.data model for other orders
                    const updatePromises = this.state.orderData
                        .filter(otherOrder => otherOrder.classification_name === order.classification_name && otherOrder.sequence > maxSequence && otherOrder.id !== order.id)
                        .map(otherOrder => this.orm.call('order.data', 'write', [[otherOrder.id], { sequence: otherOrder.sequence }]));

                    await Promise.all(updatePromises);
                } catch (error) {
                    console.error(error);
                }
                order.sequence = newSequence;
                order.urgencyStatus = 'redAlert';
            }
        }
    }


    ppc_plan_approval() {
      const checkedOrderIds = [];

      // Iterate over the table rows to find the checked checkboxes
      const checkboxes = document.getElementsByClassName('row_checkbox');
      for (let i = 0; i < checkboxes.length; i++) {
        if (checkboxes[i].checked) {
          // Get the row ID and add it to the array
          const rowId = checkboxes[i].closest('tr').getAttribute('data-row-id');
          checkedOrderIds.push(rowId);
        }
      }

      if (checkedOrderIds.length === 0) {
        this.state.notification.add('No orders selected.', {
          title: 'Info',
          type: 'info',
        });
        return;
      }

      checkedOrderIds.forEach((orderId) => {
        const order = this.state.orderData.find((o) => o.id === parseInt(orderId));
        if (order && order.status === 'PPC Operator') {
          this.orm
            .call('order.data', 'write', [[orderId], { status: 'PPC Manager' }])
            .then((result) => {
              if (result) {
                console.log(`Status updated successfully for Order ID ${orderId}`);
              } else {
                console.error(`Error occurred while updating status for Order ID ${orderId}`);
              }
            })
            .catch((error) => {
              console.error(`Error occurred while updating status for Order ID ${orderId}:`, error);
            });
        }
      });

      this.state.notification.add('Sent for Manager Approval.', {
        title: 'Success',
        type: 'success',
      });

      setTimeout(() => {
        window.location.reload();
      }, 700);
    }




}

PpcOrderView.template = 'ppc.PpcOrderViewTemplate';
registry.category('actions').add('ppc.ppc_order_view_js', PpcOrderView);
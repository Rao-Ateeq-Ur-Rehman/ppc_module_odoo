/** @odoo-module **/
import { registry } from '@web/core/registry';
const { Component, useState, onWillStart } = owl;
import { useService } from "@web/core/utils/hooks";
import { hooks } from '@odoo/owl';
import { useModel } from '@odoo/owl';

export class ApprovePpcOrder extends Component {
  setup() {
    this.orm = useService("orm");
    this.state = useState({
      fieldNames: [], // All required fields/columns and their names as well
      fields: {},
      orderData: [],
      alignedOrderData: [], // New property to store aligned order data
      pendingApprovalOrders: [],
      selectedOrders: [], //selectedOrders property

    });
    onWillStart(async () => {
      const fields = await this.fetchModelFields();
      this.state.fields = fields;
      const excludedFields = ['message_main_attachment_id', 'create_uid', 'write_uid', 'create_date', 'write_date', 'activity_date_deadline', 'activity_exception_decoration', 'activity_exception_icon', 'activity_ids', 'activity_state', 'activity_summary', 'activity_type_icon', 'activity_type_id', 'activity_user_id', "my_activity_date_deadline", "message_is_follower", "message_follower_ids",
        "message_follower_ids", "message_partner_ids", "message_ids", "has_message", "message_needaction", "message_needaction_counter", "message_has_error", "message_has_error_counter", "message_attachment_count", "message_has_sms_error", "website_message_ids", "__last_update", "display_name", "machineRoute"];
      const filteredFields = Object.keys(this.state.fields)
        .filter(fieldName => !excludedFields.includes(fieldName))
        .map(fieldName => ({
          name: fieldName,
          actualName: this.state.fields[fieldName].string,
        }));
      this.state.fieldNames = filteredFields;

      const orderData = await this.fetchOrderData();
      this.state.orderData = orderData;

      const alignedOrderData = this.alignOrderDataByClassificationType(orderData);
      this.state.alignedOrderData = alignedOrderData;
    });
    this.changeUrgencyStatus = this.changeUrgencyStatus.bind(this);
    this.onDragStart = this.onDragStart.bind(this);
    this.onDrop = this.onDrop.bind(this);
    this.onDragOver = this.onDragOver.bind(this);
    this.typingCompleted = this.typingCompleted.bind(this);
    this.ppc_plan_approval = this.ppc_plan_approval.bind(this);
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
    if (order.status !== 'PPC Operator') { // Filter orders by status
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
    return result.fields;
  }
  async fetchOrderData() {
    const fieldNames = this.state.fieldNames.map(field => field.name);
    const orderData = await this.orm.searchRead('order.data', [], fieldNames);
    return orderData;
  }

  async changeUrgencyStatus(orderId, event) {
    const order = this.state.orderData.find(order => order.id === orderId);
    if (order) {
      if ((order.urgencyStatus === 'orderLate' || order.urgencyStatus === 'dispatchDate') && event.target.value === 'redAlert') {
        // Retrieve the max sequence value with urgencyStatus 'redAlert' for the same classification_name
        const maxSequence = this.state.orderData
          .filter(otherOrder => otherOrder.classification_name === order.classification_name && otherOrder.urgencyStatus === 'redAlert')
          .reduce((max, otherOrder) => (otherOrder.sequence > max ? otherOrder.sequence : max), -Infinity);
        const newSequence = maxSequence + 1;
        this.state.orderData
          .filter(otherOrder => otherOrder.classification_name === order.classification_name && otherOrder.sequence > maxSequence && otherOrder.id !== order.id)
          .forEach(otherOrder => {
            otherOrder.sequence++;
          });
        try {
          // Update the sequence value in the order.data model using Odoo's ORM
          await this.orm.call('order.data', 'write', [[order.id], { sequence: newSequence, urgencyStatus: 'redAlert' }]);
          console.log("Sequence and urgencyStatus values updated successfully");
          // Update the sequence values in the order.data model for other orders
          const updatePromises = this.state.orderData
            .filter(otherOrder => otherOrder.classification_name === order.classification_name && otherOrder.sequence > maxSequence && otherOrder.id !== order.id)
            .map(otherOrder => this.orm.call('order.data', 'write', [[otherOrder.id], { sequence: otherOrder.sequence }]));

          await Promise.all(updatePromises);
          console.log("Sequence values updated for higher orders");
        } catch (error) {
          console.error(error);
        }
        order.sequence = newSequence;
        order.urgencyStatus = 'redAlert';
      }
    }
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

    ppc_plan_approval() {
      const { orderData } = this.state;
      const selectedOrders = orderData.filter(order => {
        const checkbox = document.querySelector(`[data-row-id="${order.id}"] .row_checkbox`);
        return checkbox && checkbox.checked;
      });

      const orderIds = selectedOrders.map(order => order.id);
      console.log('Selected Orders:', orderIds);


      orderIds.forEach((orderId) => {
            this.orm
                .call('order.data', 'write', [[orderId], { status: 'PPC Manager Approved' }])
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
        });

    }

}

ApprovePpcOrder.template = 'ppc.ApprovePpcOrderTemplate';
registry.category('actions').add('ppc.approve_ppc_order_js', ApprovePpcOrder);

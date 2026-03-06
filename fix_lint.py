import re

with open('admin.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix broken template literals
text = text.replace('${ API }', '${API}')
text = text.replace('${ orderId }', '${orderId}')
text = text.replace('${ index }', '${index}')

# Fix URLs
text = text.replace('create - order', 'create-order')
text = text.replace('get - all - orders', 'get-all-orders')
text = text.replace('update - order - full', 'update-order-full')
text = text.replace('update - order - status', 'update-order-status')
text = text.replace('add - note', 'add-note')
text = text.replace('delete - order', 'delete-order')
text = text.replace('get - notes ? orderId =', 'get-notes?orderId=')

# Fix HTML that was mangled inside the notes div
text = text.replace('< div class="note-item" >', '<div class="note-item">')
text = text.replace('</ div >', '</div>')

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(text)

print("Formatting bugs fixed!")

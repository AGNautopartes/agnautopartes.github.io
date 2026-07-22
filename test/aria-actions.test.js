import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeConversationHistory,
    parseActionBlocks
} from '../api/lib/aria-actions.js';

test('removes a duplicated current user message from history', () => {
    const history = [
        { role: 'assistant', content: '¿Qué necesita?' },
        { role: 'user', content: 'Actualiza dos órdenes' }
    ];

    assert.deepEqual(
        normalizeConversationHistory(history, 'Actualiza dos órdenes'),
        [{ role: 'assistant', content: '¿Qué necesita?' }]
    );
});

test('keeps prior user messages that differ from the current message', () => {
    const history = [{ role: 'user', content: 'Mensaje anterior' }];

    assert.deepEqual(
        normalizeConversationHistory(history, 'Mensaje actual'),
        history
    );
});

test('parses multiple Aria actions in order', () => {
    const actions = parseActionBlocks(
        '[UPDATE_STATUS:ORD-1|Cotizado]\n[ADD_NOTE:ORD-1|Cliente confirmó]'
    );

    assert.deepEqual(actions, [
        { type: 'UPDATE_STATUS', data: 'ORD-1|Cotizado' },
        { type: 'ADD_NOTE', data: 'ORD-1|Cliente confirmó' }
    ]);
});

test('returns no actions for a conversational response', () => {
    assert.deepEqual(parseActionBlocks('Necesito el número de orden.'), []);
});

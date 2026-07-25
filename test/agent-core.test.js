import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandRegistry } from '../lib/agent-core/command-registry.js';
import { invokeApiHandler } from '../lib/agent-core/handler-adapter.js';
import {
    isAllowedAgentModel,
    modelSupportsAgentUse,
    selectAgentModel
} from '../lib/agent-core/model-policy.js';
import { requestAriaDecision } from '../lib/aria/aria-agent.js';

const buildRegistry = execute => createCommandRegistry([{
    name: 'set_alarm',
    description: 'Activa una alarma',
    requiresConfirmation: true,
    parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
            order_ref: { type: 'string', minLength: 1 },
            enabled: { type: 'boolean' }
        },
        required: ['order_ref', 'enabled']
    },
    execute
}]);

test('exposes readable command definitions as model tools', () => {
    const registry = buildRegistry(async () => ({ ok: true }));
    const tools = registry.toModelTools();

    assert.equal(tools.length, 1);
    assert.equal(tools[0].function.name, 'set_alarm');
    assert.equal(tools[0].function.description, 'Activa una alarma');
    assert.deepEqual(
        tools[0].function.parameters.required,
        ['order_ref', 'enabled']
    );
});

test('validates command arguments before executing ERP code', async () => {
    let executionCount = 0;
    const registry = buildRegistry(async () => {
        executionCount += 1;
        return { ok: true };
    });

    const result = await registry.execute('set_alarm', {
        order_ref: 'ORD-10',
        enabled: 'yes'
    });

    assert.equal(result.code, 'INVALID_ARGUMENTS');
    assert.equal(executionCount, 0);
});

test('rejects unexpected command arguments', async () => {
    let executionCount = 0;
    const registry = buildRegistry(async () => {
        executionCount += 1;
        return { ok: true };
    });

    const result = await registry.execute('set_alarm', {
        order_ref: 'ORD-10',
        enabled: true,
        injected_field: 'not allowed'
    });

    assert.equal(result.code, 'INVALID_ARGUMENTS');
    assert.match(result.message, /injected_field/);
    assert.equal(executionCount, 0);
});

test('rejects oversized string arguments', async () => {
    const registry = buildRegistry(async () => ({ ok: true }));
    const result = await registry.execute('set_alarm', {
        order_ref: 'X'.repeat(2001),
        enabled: true
    });

    assert.equal(result.code, 'INVALID_ARGUMENTS');
    assert.match(result.message, /2000 caracteres/);
});

test('rejects numbers below the command minimum', async () => {
    const registry = createCommandRegistry([{
        name: 'set_price',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                price: { type: 'number', minimum: 0 }
            },
            required: ['price']
        },
        execute: async () => ({ ok: true })
    }]);

    const result = await registry.execute('set_price', { price: -1 });
    assert.equal(result.code, 'INVALID_ARGUMENTS');
    assert.match(result.message, /mayor o igual a 0/);
});

test('requires confirmation and then executes the same registered command', async () => {
    let receivedArgs;
    const registry = buildRegistry(async args => {
        receivedArgs = args;
        return { ok: true, message: 'Alarma actualizada' };
    });
    const args = { order_ref: 'ORD-10', enabled: true };

    const pending = await registry.execute('set_alarm', args);
    assert.equal(pending.code, 'CONFIRMATION_REQUIRED');

    const executed = await registry.execute('set_alarm', args, {
        confirmDestructive: true
    });
    assert.equal(executed.ok, true);
    assert.deepEqual(receivedArgs, args);
});

test('invokes an existing ERP API handler without an HTTP request', async () => {
    const handler = async (req, res) => res
        .status(201)
        .json({ message: 'Creado', received: req.body });

    const result = await invokeApiHandler(handler, {
        method: 'POST',
        headers: { 'x-admin-password': 'test' },
        body: { customer_name: 'Juan' }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 201);
    assert.equal(result.body.received.customer_name, 'Juan');
});

test('allows the free router and blocks safety-only models', () => {
    assert.equal(isAllowedAgentModel('openrouter/free'), true);
    assert.equal(isAllowedAgentModel('nvidia/content-safety:free'), false);
    assert.equal(isAllowedAgentModel('vendor/useful-tool-model:free'), true);
    assert.equal(selectAgentModel('openrouter/free'), 'openrouter/free');
});

test('accepts only catalog models with tool support', () => {
    assert.equal(modelSupportsAgentUse({ supported_parameters: ['tools'] }), true);
    assert.equal(modelSupportsAgentUse({ supported_parameters: ['temperature'] }), false);
});

test('model catalog includes paid and free tool-capable models', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
            data: [
                {
                    id: 'vendor/paid-agent',
                    name: 'Paid Agent',
                    pricing: { prompt: '0.001' },
                    supported_parameters: ['tools']
                },
                {
                    id: 'vendor/free-agent:free',
                    name: 'Free Agent',
                    pricing: { prompt: '0' },
                    supported_parameters: ['tool_choice']
                },
                {
                    id: 'vendor/chat-only',
                    name: 'Chat Only',
                    pricing: { prompt: '0' },
                    supported_parameters: ['temperature']
                }
            ]
        })
    });

    try {
        const { default: getModelsHandler } = await import('../api/get-models.js');
        const response = await invokeApiHandler(getModelsHandler, {
            method: 'GET'
        });
        const ids = response.body.map(model => model.id);

        assert.equal(response.ok, true);
        assert.equal(ids[0], 'openrouter/free');
        assert.equal(response.body[0].isDefault, true);
        assert.equal(ids.includes('vendor/paid-agent'), true);
        assert.equal(ids.includes('vendor/free-agent:free'), true);
        assert.equal(ids.includes('vendor/chat-only'), false);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('translates a provider tool call into a validated command request', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody;
    globalThis.fetch = async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return {
            ok: true,
            json: async () => ({
                model: 'vendor/tool-model:free',
                choices: [{
                    message: {
                        tool_calls: [{
                            function: {
                                name: 'set_order_alarm',
                                arguments: '{"order_ref":"ORD-10","enabled":true}'
                            }
                        }]
                    }
                }]
            })
        };
    };

    try {
        const result = await requestAriaDecision({
            apiKey: 'test-key',
            requestedModel: 'vendor/tool-model:free',
            message: 'Activa la alarma de la orden 10',
            conversationHistory: [],
            adminName: 'Admin',
            orders: [],
            tools: [{ type: 'function', function: { name: 'set_order_alarm' } }]
        });

        assert.equal(result.type, 'command');
        assert.equal(result.command.name, 'set_order_alarm');
        assert.deepEqual(result.command.args, {
            order_ref: 'ORD-10',
            enabled: true
        });
        assert.equal(requestBody.parallel_tool_calls, undefined);
        assert.equal(requestBody.provider, undefined);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('AGN command catalog is explicit and readable', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
    const { createAgnCommandRegistry } = await import('../lib/agn-erp/command-catalog.js');

    const commandNames = createAgnCommandRegistry()
        .describe()
        .map(command => command.name);

    assert.deepEqual(commandNames, [
        'create_order',
        'set_order_fob',
        'set_order_price',
        'open_order',
        'set_order_status',
        'set_order_alarm',
        'update_order_customer',
        'add_order_part',
        'add_order_note'
    ]);
});

test('open_order reads exactly one numbered order', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
    const { createAgnCommandRegistry } =
        await import('../lib/agn-erp/command-catalog.js');
    let receivedQuery;

    const result = await createAgnCommandRegistry().execute(
        'open_order',
        { order_ref: '205' },
        {
            readOrders: async query => {
                receivedQuery = query;
                return {
                    ok: true,
                    orders: [{ id: 'uuid-205', readable_id: 'ORD-205' }]
                };
            }
        }
    );

    assert.deepEqual(receivedQuery, { view: 'aria', orderRef: '205' });
    assert.equal(result.ok, true);
    assert.equal(result.data.openOrderId, 'uuid-205');
});

test('open_order limits exact-name lookup and rejects ambiguity', async () => {
    const { createAgnCommandRegistry } =
        await import('../lib/agn-erp/command-catalog.js');
    let receivedQuery;

    const result = await createAgnCommandRegistry().execute(
        'open_order',
        { customer_name: 'Carlos Castro' },
        {
            readOrders: async query => {
                receivedQuery = query;
                return {
                    ok: true,
                    orders: [
                        { id: 'one', readable_id: 'ORD-205' },
                        { id: 'two', readable_id: 'ORD-199' }
                    ]
                };
            }
        }
    );

    assert.deepEqual(receivedQuery, {
        view: 'aria',
        customerName: 'Carlos Castro',
        limit: '2'
    });
    assert.equal(result.code, 'MULTIPLE_ORDERS_FOUND');
});

test('financial commands preserve FOB decimals and price before VAT', async () => {
    const { createAgnCommandRegistry } =
        await import('../lib/agn-erp/command-catalog.js');
    let order = {
        id: 'uuid-209',
        readable_id: 'ORD-209',
        order_items: [{
            part_name: 'Mascarilla',
            fob_cost: 0,
            cost_fob: 0,
            sale_price: 0,
            price: 0
        }]
    };
    const context = {
        readOrders: async () => ({ ok: true, orders: [order] }),
        updateOrder: async body => {
            order = { ...order, order_items: body.items_json };
            return { ok: true, message: 'Actualizado', refreshOrders: true };
        }
    };
    const registry = createAgnCommandRegistry();

    const fobResult = await registry.execute('set_order_fob', {
        order_ref: 'ORD-209',
        cost_fob: 19.81
    }, context);
    const priceResult = await registry.execute('set_order_price', {
        order_ref: 'ORD-209',
        price_before_vat: 109
    }, context);

    assert.equal(fobResult.ok, true);
    assert.equal(priceResult.ok, true);
    assert.equal(order.order_items[0].fob_cost, 19.81);
    assert.equal(order.order_items[0].sale_price, 109);
});

test('command sequence reuses the newly created order reference', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
    const { executeCommandSequence } = await import('../api/admin-chat.js');
    const received = [];
    const registry = {
        execute: async (name, args) => {
            received.push({ name, args });
            if (name === 'create_order') {
                return {
                    ok: true,
                    message: 'Creada',
                    data: { orderId: 'ORD-209' }
                };
            }
            return { ok: true, message: 'Actualizada', data: {} };
        }
    };

    const result = await executeCommandSequence(registry, [
        { name: 'create_order', args: { customer_name: 'Ana' } },
        { name: 'set_order_fob', args: { order_ref: '$new_order', cost_fob: 19.81 } },
        { name: 'set_order_price', args: { order_ref: '$new_order', price_before_vat: 109 } }
    ], {});

    assert.equal(result.ok, true);
    assert.equal(received[1].args.order_ref, 'ORD-209');
    assert.equal(received[2].args.order_ref, 'ORD-209');
});

test('Aria prompt guides an unsure user and defines financial sequencing', async () => {
    const { ARIA_PROMPT_VERSION, buildAriaSystemPrompt } =
        await import('../lib/aria/aria-prompt.js');
    const prompt = buildAriaSystemPrompt({ adminName: 'Admin', orders: [] });

    assert.equal(ARIA_PROMPT_VERSION, '2.3.1');
    assert.match(prompt, /cómo usar Aria/i);
    assert.match(prompt, /ORD-205/);
    assert.match(prompt, /No afirmar que una acción fue realizada/i);
    assert.match(prompt, /No puedes eliminar órdenes/i);
    assert.match(prompt, /No hay órdenes precargadas/i);
    assert.match(prompt, /Carls Castro/i);
    assert.match(prompt, /create_order, set_order_fob y set_order_price/i);
    assert.match(prompt, /precio antes de IVA/i);
    assert.match(prompt, /\$new_order/i);
    assert.match(prompt, /update_order_customer con order_ref y customer_phone/i);
});

test('customer update command exposes WhatsApp as customer_phone', async () => {
    const { createAgnCommandRegistry } =
        await import('../lib/agn-erp/command-catalog.js');
    const command = createAgnCommandRegistry()
        .describe()
        .find(item => item.name === 'update_order_customer');

    assert.match(command.description, /teléfono o WhatsApp/i);
    assert.match(
        command.parameters.properties.customer_phone.description,
        /ficha de la orden/i
    );
});

test('translates multiple provider tool calls in their original order', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
            model: 'vendor/tool-model:free',
            choices: [{
                message: {
                    tool_calls: [
                        {
                            function: {
                                name: 'create_order',
                                arguments: '{"customer_name":"Ana","vehicle_brand":"Kia","vehicle_model":"Cerato","part_name":"Faro"}'
                            }
                        },
                        {
                            function: {
                                name: 'set_order_fob',
                                arguments: '{"order_ref":"$new_order","cost_fob":19.81}'
                            }
                        },
                        {
                            function: {
                                name: 'set_order_price',
                                arguments: '{"order_ref":"$new_order","price_before_vat":109}'
                            }
                        }
                    ]
                }
            }]
        })
    });

    try {
        const result = await requestAriaDecision({
            apiKey: 'test-key',
            requestedModel: 'vendor/tool-model:free',
            message: 'Crea una orden con FOB 19.81 y precio 109',
            conversationHistory: [],
            adminName: 'Admin',
            orders: [],
            tools: []
        });

        assert.deepEqual(
            result.commands.map(command => command.name),
            ['create_order', 'set_order_fob', 'set_order_price']
        );
        assert.equal(result.commands[1].args.cost_fob, 19.81);
        assert.equal(result.commands[2].args.price_before_vat, 109);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

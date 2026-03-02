import 'dotenv/config';
import supabase from './supabase-client.js';

async function testConnection() {
    console.log('Testing Supabase connection...');
    try {
        const { data, error } = await supabase.from('customers').select('count', { count: 'exact', head: true });

        if (error) {
            console.error('Error connecting to Supabase:', error.message);
        } else {
            console.log('Successfully connected to Supabase!');
            console.log('Connection test result:', data);
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

testConnection();


-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom enums
CREATE TYPE user_role AS ENUM ('customer', 'seller', 'affiliate', 'admin');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE commission_type AS ENUM ('admin_direct', 'admin_affiliate', 'affiliate');
CREATE TYPE commission_status AS ENUM ('pending', 'paid');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'completed');

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    role user_role NOT NULL,
    full_name TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    referral_code TEXT UNIQUE
);

-- Create sellers table
CREATE TABLE sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL,
    product_count INTEGER DEFAULT 0,
    max_products INTEGER DEFAULT 30
);

-- Create products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image_url TEXT,
    business_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    shipping_address TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_status payment_status DEFAULT 'pending',
    payment_reference TEXT UNIQUE,
    affiliate_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create commissions table
CREATE TABLE commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    commission_type commission_type NOT NULL,
    status commission_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create withdrawals table
CREATE TABLE withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    status withdrawal_status DEFAULT 'pending',
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create analytics table
CREATE TABLE analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,
    page_views INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    purchases_count INTEGER DEFAULT 0
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_sellers_user_id ON sellers(user_id);
CREATE INDEX idx_products_seller_id ON products(seller_id);
CREATE INDEX idx_transactions_product_id ON transactions(product_id);
CREATE INDEX idx_transactions_affiliate_id ON transactions(affiliate_id);
CREATE INDEX idx_transactions_payment_status ON transactions(payment_status);
CREATE INDEX idx_commissions_transaction_id ON commissions(transaction_id);
CREATE INDEX idx_commissions_recipient_id ON commissions(recipient_id);
CREATE INDEX idx_withdrawals_affiliate_id ON withdrawals(affiliate_id);

-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Admin full access on all tables
CREATE POLICY "Admin full access on users" ON users FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin full access on sellers" ON sellers FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin full access on products" ON products FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin full access on transactions" ON transactions FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin full access on commissions" ON commissions FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin full access on withdrawals" ON withdrawals FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin full access on analytics" ON analytics FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Sellers can view/edit their own products
CREATE POLICY "Sellers can view their own products" ON products FOR SELECT USING (seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid()));
CREATE POLICY "Sellers can insert their own products" ON products FOR INSERT WITH CHECK (seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid()));
CREATE POLICY "Sellers can update their own products" ON products FOR UPDATE USING (seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid()));
CREATE POLICY "Sellers can delete their own products" ON products FOR DELETE USING (seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid()));

-- Affiliates can view their own commissions
CREATE POLICY "Affiliates can view their own commissions" ON commissions FOR SELECT USING (recipient_id = auth.uid() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'affiliate'));
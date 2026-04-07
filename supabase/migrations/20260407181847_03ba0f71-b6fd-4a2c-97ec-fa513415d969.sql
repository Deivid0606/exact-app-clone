
-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('ADMIN', 'VENDEDOR', 'DELIVERY', 'DESPACHANTE', 'PROVEEDOR');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  doc TEXT,
  addr TEXT,
  bank_name TEXT,
  bank_type TEXT,
  bank_num TEXT,
  bank_holder TEXT,
  bank_holder_ci TEXT,
  wallet_provider TEXT,
  wallet_number TEXT,
  wallet_holder TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  sku TEXT,
  provider_price_gs NUMERIC DEFAULT 0,
  stock INTEGER DEFAULT 0,
  real_stock INTEGER DEFAULT 0,
  real_cost_gs NUMERIC DEFAULT 0,
  image_url TEXT,
  image_url_2 TEXT,
  image_url_3 TEXT,
  description TEXT,
  is_private BOOLEAN DEFAULT false,
  allowed_emails_json TEXT,
  provider_email TEXT,
  private_to_emails TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE,
  created_by TEXT,
  customer_name TEXT,
  phone TEXT,
  city TEXT,
  street TEXT,
  district TEXT,
  email TEXT,
  items_json JSONB DEFAULT '[]',
  total_gs NUMERIC DEFAULT 0,
  delivery_gs NUMERIC DEFAULT 0,
  commission_gs NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'PENDIENTE',
  status2 TEXT,
  obs TEXT,
  assigned_delivery TEXT,
  assigned_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  commission_credited BOOLEAN DEFAULT false,
  commission_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  delivery_fee_gs NUMERIC DEFAULT 0,
  delivery_fee_credited BOOLEAN DEFAULT false,
  delivery_settled BOOLEAN DEFAULT false,
  delivery_paid_at TIMESTAMPTZ,
  provider_emails_list TEXT,
  pack_qty INTEGER,
  pack_by TEXT,
  pack_amount_gs NUMERIC,
  pack_credited BOOLEAN DEFAULT false,
  pack_paid_at TIMESTAMPTZ,
  pack_count INTEGER,
  pack_fee_gs NUMERIC,
  pack_fee_credited BOOLEAN DEFAULT false,
  estado_retiro TEXT,
  provider_stock_applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create wallets table
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  balance_gs NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Create wallet_transactions table
CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT,
  email TEXT,
  order_id TEXT,
  amount_gs NUMERIC DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Create delivery_fees table
CREATE TABLE public.delivery_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_email TEXT,
  city TEXT,
  fee_gs NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_fees ENABLE ROW LEVEL SECURITY;

-- Create client_prices table
CREATE TABLE public.client_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL UNIQUE,
  price_gs NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_prices ENABLE ROW LEVEL SECURITY;

-- Create news table
CREATE TABLE public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT,
  actor_email TEXT,
  role_scope TEXT,
  target_email TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_email TEXT,
  sender_email TEXT,
  sender_role TEXT,
  message_text TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create chat_dm_messages table
CREATE TABLE public.chat_dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_key TEXT,
  from_email TEXT,
  to_email TEXT,
  from_role TEXT,
  message_text TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_dm_messages ENABLE ROW LEVEL SECURITY;

-- Create commission_requests table
CREATE TABLE public.commission_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_email TEXT,
  provider_email TEXT,
  amount_gs NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'PENDIENTE',
  note TEXT,
  requested_at TIMESTAMPTZ DEFAULT now(),
  requested_by TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  approval_note TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by TEXT,
  range_from TEXT,
  range_to TEXT,
  meta_json JSONB
);
ALTER TABLE public.commission_requests ENABLE ROW LEVEL SECURITY;

-- Create rendiciones_pagadas table
CREATE TABLE public.rendiciones_pagadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_email TEXT,
  fecha_rendicion TEXT,
  monto_total NUMERIC DEFAULT 0,
  nota TEXT,
  marcado_por TEXT,
  marcado_en TIMESTAMPTZ,
  pagado_en TIMESTAMPTZ
);
ALTER TABLE public.rendiciones_pagadas ENABLE ROW LEVEL SECURITY;

-- Create order sequence counter
CREATE TABLE public.order_sequence (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  counter INTEGER DEFAULT 0,
  prefix TEXT DEFAULT 'A',
  pad INTEGER DEFAULT 3
);
ALTER TABLE public.order_sequence ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND approved = true
  )
$$;

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::TEXT FROM public.user_roles
  WHERE user_id = _user_id AND approved = true
  LIMIT 1
$$;

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-approve first user as ADMIN
CREATE OR REPLACE FUNCTION public.handle_new_role()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.user_roles) = 1 THEN
    UPDATE public.user_roles SET role = 'ADMIN', approved = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_role_created
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_role();

-- RLS Policies

-- user_roles
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Users can request a role" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'ADMIN'));

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Authenticated can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- products
CREATE POLICY "Authenticated can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Providers can manage own products" ON public.products FOR ALL USING (
  public.has_role(auth.uid(), 'PROVEEDOR') AND
  provider_email = (SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
);

-- orders
CREATE POLICY "Authenticated can view orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update orders" ON public.orders FOR UPDATE TO authenticated USING (true);

-- wallets
CREATE POLICY "Authenticated can view wallets" ON public.wallets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage wallets" ON public.wallets FOR ALL USING (public.has_role(auth.uid(), 'ADMIN'));

-- wallet_transactions
CREATE POLICY "Authenticated can view txs" ON public.wallet_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert txs" ON public.wallet_transactions FOR INSERT TO authenticated WITH CHECK (true);

-- delivery_fees
CREATE POLICY "Authenticated can view fees" ON public.delivery_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage fees" ON public.delivery_fees FOR ALL USING (public.has_role(auth.uid(), 'ADMIN'));

-- client_prices
CREATE POLICY "Authenticated can view prices" ON public.client_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage prices" ON public.client_prices FOR ALL USING (public.has_role(auth.uid(), 'ADMIN'));

-- news
CREATE POLICY "Authenticated can view news" ON public.news FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert news" ON public.news FOR INSERT TO authenticated WITH CHECK (true);

-- chat_messages
CREATE POLICY "Authenticated can view chat" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can send chat" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (true);

-- chat_dm_messages
CREATE POLICY "Users can view own DMs" ON public.chat_dm_messages FOR SELECT TO authenticated USING (
  from_email = (SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) OR
  to_email = (SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
);
CREATE POLICY "Authenticated can send DMs" ON public.chat_dm_messages FOR INSERT TO authenticated WITH CHECK (true);

-- commission_requests
CREATE POLICY "Authenticated can view commissions" ON public.commission_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert commissions" ON public.commission_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins and providers can update commissions" ON public.commission_requests FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'PROVEEDOR')
);

-- rendiciones_pagadas
CREATE POLICY "Authenticated can view rendiciones" ON public.rendiciones_pagadas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage rendiciones" ON public.rendiciones_pagadas FOR ALL USING (public.has_role(auth.uid(), 'ADMIN'));

-- order_sequence
CREATE POLICY "Authenticated can view sequence" ON public.order_sequence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage sequence" ON public.order_sequence FOR ALL USING (public.has_role(auth.uid(), 'ADMIN'));

-- Insert initial sequence
INSERT INTO public.order_sequence (id, counter, prefix, pad) VALUES (1, 0, 'A', 3);

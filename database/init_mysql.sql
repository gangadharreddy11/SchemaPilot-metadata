-- SchemaPilot MySQL Sample Database Initialization Script
CREATE DATABASE IF NOT EXISTS schemapilot;
USE schemapilot;

CREATE TABLE IF NOT EXISTS customers (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    order_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (order_id, product_id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB;

CREATE INDEX ix_orders_customer_id ON orders(customer_id);
CREATE INDEX ix_order_items_product_id ON order_items(product_id);

INSERT IGNORE INTO customers (customer_id, name, email) VALUES
(1, 'Aarav Sharma', 'aarav@example.com'),
(2, 'Priya Reddy', 'priya@example.com'),
(3, 'Rahul Kumar', 'rahul@example.com');

INSERT IGNORE INTO products (product_id, name, price, stock) VALUES
(1, 'Smartphone', 15000.00, 25),
(2, 'Headphones', 2000.00, 60),
(3, 'Laptop', 62000.00, 12);

INSERT IGNORE INTO orders (order_id, customer_id, status) VALUES
(1, 1, 'confirmed');

INSERT IGNORE INTO order_items (order_id, product_id, quantity, unit_price) VALUES
(1, 1, 1, 15000.00);

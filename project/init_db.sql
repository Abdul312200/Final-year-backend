CREATE DATABASE IF NOT EXISTS fintechiq;
USE fintechiq;

CREATE TABLE IF NOT EXISTS Users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200),
  email VARCHAR(200) UNIQUE,
  password VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS Predictions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticker VARCHAR(20),
  input_days INT,
  predicted_price FLOAT,
  requested_at DATETIME,
  UserId INT,
  FOREIGN KEY (UserId) REFERENCES Users(id)
);

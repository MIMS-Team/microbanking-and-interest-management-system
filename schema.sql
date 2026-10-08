CREATE DATABASE  IF NOT EXISTS `mims_dev_test` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `mims_dev_test`;
-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: mims_dev_test
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `branches`
--

DROP TABLE IF EXISTS `branches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `branches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_accounts`
--

DROP TABLE IF EXISTS `customer_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_accounts` (
  `customer_id` int NOT NULL,
  `account_id` int NOT NULL,
  PRIMARY KEY (`customer_id`,`account_id`),
  KEY `account_id` (`account_id`),
  CONSTRAINT `customer_accounts_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `customer_accounts_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `savings_accounts` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_max_four_joint_owners` BEFORE INSERT ON `customer_accounts` FOR EACH ROW BEGIN
    DECLARE owner_count INT;
    SELECT COUNT(*) INTO owner_count 
    FROM customer_accounts 
    WHERE account_id = NEW.account_id;
    IF owner_count >= 4 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Validation Error: A joint account cannot have more than 4 owners.';
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_number` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nic` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date_of_birth` date NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `mobile` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `landline` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_id` int NOT NULL,
  `agent_id` int NOT NULL,
  `status` enum('pending','active','inactive','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_number` (`customer_number`),
  UNIQUE KEY `nic` (`nic`),
  KEY `agent_id` (`agent_id`),
  KEY `idx_customers_branch_agent` (`branch_id`,`agent_id`),
  CONSTRAINT `customers_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `customers_ibfk_2` FOREIGN KEY (`agent_id`) REFERENCES `staff` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fixed_deposits`
--

DROP TABLE IF EXISTS `fixed_deposits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fixed_deposits` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fd_number` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_account_id` int NOT NULL,
  `rate_id` int NOT NULL,
  `principal` decimal(14,2) NOT NULL,
  `annual_rate` decimal(6,3) NOT NULL,
  `term_months` int NOT NULL,
  `auto_renew` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('pending','active','closed','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `opened_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `maturity_date` date NOT NULL,
  `payout_date` date DEFAULT NULL,
  `renewed_from_id` int DEFAULT NULL,
  `closed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fd_number` (`fd_number`),
  UNIQUE KEY `renewed_from_id` (`renewed_from_id`),
  KEY `source_account_id` (`source_account_id`),
  KEY `rate_id` (`rate_id`),
  CONSTRAINT `fixed_deposits_ibfk_1` FOREIGN KEY (`source_account_id`) REFERENCES `savings_accounts` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fixed_deposits_ibfk_2` FOREIGN KEY (`rate_id`) REFERENCES `rates` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fixed_deposits_ibfk_3` FOREIGN KEY (`renewed_from_id`) REFERENCES `fixed_deposits` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_fd_principal` CHECK ((`principal` > 0)),
  CONSTRAINT `chk_fd_rate` CHECK ((`annual_rate` between 0 and 100)),
  CONSTRAINT `chk_fd_term` CHECK ((`term_months` between 1 and 120))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_one_live_fd_per_account` BEFORE INSERT ON `fixed_deposits` FOR EACH ROW BEGIN
    DECLARE live_fd_count INT;
    
    IF NEW.status IN ('pending', 'active') THEN
        SELECT COUNT(*) INTO live_fd_count
        FROM fixed_deposits
        WHERE source_account_id = NEW.source_account_id
          AND status IN ('pending', 'active');
          
        IF live_fd_count > 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Validation Error: Only one live (pending or active) FD is allowed per savings account.';
        END IF;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `rates`
--

DROP TABLE IF EXISTS `rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product` enum('savings','fixed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `term_months` int NOT NULL DEFAULT '0',
  `annual_rate` decimal(6,3) NOT NULL,
  `minimum_balance` decimal(14,2) NOT NULL DEFAULT '0.00',
  `min_age` int NOT NULL DEFAULT '0',
  `max_age` int NOT NULL DEFAULT '120',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  CONSTRAINT `chk_annual_rate` CHECK ((`annual_rate` between 0 and 100)),
  CONSTRAINT `chk_min_balance` CHECK ((`minimum_balance` >= 0)),
  CONSTRAINT `chk_product_terms` CHECK ((((`product` = _utf8mb4'savings') and (`term_months` = 0)) or ((`product` = _utf8mb4'fixed') and (`term_months` > 0)))),
  CONSTRAINT `chk_term_months` CHECK ((`term_months` between 0 and 120))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `savings_accounts`
--

DROP TABLE IF EXISTS `savings_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `savings_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_number` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_id` int NOT NULL,
  `agent_id` int NOT NULL,
  `rate_id` int NOT NULL,
  `balance` decimal(14,2) NOT NULL DEFAULT '0.00',
  `minimum_balance` decimal(14,2) NOT NULL DEFAULT '500.00',
  `status` enum('pending','active','inactive','closed','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `opened_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_number` (`account_number`),
  KEY `agent_id` (`agent_id`),
  KEY `rate_id` (`rate_id`),
  KEY `idx_accounts_branch` (`branch_id`),
  CONSTRAINT `savings_accounts_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `savings_accounts_ibfk_2` FOREIGN KEY (`agent_id`) REFERENCES `staff` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `savings_accounts_ibfk_3` FOREIGN KEY (`rate_id`) REFERENCES `rates` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_savings_balance` CHECK ((`balance` >= 0)),
  CONSTRAINT `chk_savings_min_bal` CHECK ((`minimum_balance` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `staff`
--

DROP TABLE IF EXISTS `staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','higher_manager','manager','agent') COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_id` int DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `branch_id` (`branch_id`),
  CONSTRAINT `staff_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_staff_role_branch` CHECK (((`role` in (_utf8mb4'admin',_utf8mb4'higher_manager')) or (`branch_id` is not null)))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `staff_authentication`
--

DROP TABLE IF EXISTS `staff_authentication`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff_authentication` (
  `employee_id` int NOT NULL,
  `password_hash` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_attempts` int NOT NULL DEFAULT '0',
  `locked_until` timestamp NULL DEFAULT NULL,
  `last_login_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`employee_id`),
  CONSTRAINT `fk_staff_auth_employee` FOREIGN KEY (`employee_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee_sessions`
--

DROP TABLE IF EXISTS `employee_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_sessions` (
  `token_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_activity_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NULL DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`token_hash`),
  KEY `idx_sessions_employee` (`employee_id`),
  KEY `idx_sessions_expires_at` (`expires_at`),
  CONSTRAINT `fk_sessions_employee` FOREIGN KEY (`employee_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `otp_challenges`
--

DROP TABLE IF EXISTS `otp_challenges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `otp_challenges` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` int NOT NULL,
  `purpose` enum('login','password_reset','employee_creation','employee_deactivation') COLLATE utf8mb4_unicode_ci NOT NULL,
  `code_hash` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` int NOT NULL DEFAULT '0',
  `max_attempts` int NOT NULL DEFAULT '5',
  `expires_at` timestamp NOT NULL,
  `consumed_at` timestamp NULL DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_otp_employee_purpose` (`employee_id`,`purpose`,`created_at`),
  CONSTRAINT `fk_otp_employee` FOREIGN KEY (`employee_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `authentication_audit`
--

DROP TABLE IF EXISTS `authentication_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `authentication_audit` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `details` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_email` (`email`,`created_at`),
  KEY `idx_audit_employee` (`employee_id`,`created_at`),
  KEY `idx_audit_event` (`event_type`,`created_at`),
  CONSTRAINT `fk_audit_employee` FOREIGN KEY (`employee_id`) REFERENCES `staff` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-01 13:16:02

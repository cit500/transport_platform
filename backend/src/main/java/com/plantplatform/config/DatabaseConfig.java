package com.plantplatform.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;

/** 统一的平台数据库连接。 */
@Configuration
public class DatabaseConfig {

    @Bean(name = "platformDataSource")
    public DataSource platformDataSource(
            @Value("${app.datasource.url}") String url,
            @Value("${app.datasource.username}") String username,
            @Value("${app.datasource.password}") String password) {
        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setJdbcUrl(url);
        dataSource.setUsername(username);
        dataSource.setPassword(password);
        dataSource.setDriverClassName("com.mysql.cj.jdbc.Driver");
        dataSource.setPoolName("transport-platform-pool");
        dataSource.setMaximumPoolSize(6);
        dataSource.setMinimumIdle(1);
        return dataSource;
    }

    @Bean(name = "platformJdbcTemplate")
    public JdbcTemplate platformJdbcTemplate(@Qualifier("platformDataSource") DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }

    @Bean(name = "platformTransactionManager")
    public PlatformTransactionManager platformTransactionManager(
            @Qualifier("platformDataSource") DataSource dataSource) {
        return new DataSourceTransactionManager(dataSource);
    }
}

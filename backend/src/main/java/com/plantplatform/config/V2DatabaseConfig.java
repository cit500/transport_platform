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

/** 平台业务数据库连接，统一访问 transport_resilience_v2。 */
@Configuration
public class V2DatabaseConfig {

    @Bean(name = "v2DataSource")
    public DataSource v2DataSource(
            @Value("${app.v2-datasource.url}") String url,
            @Value("${app.v2-datasource.username}") String username,
            @Value("${app.v2-datasource.password}") String password) {
        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setJdbcUrl(url);
        dataSource.setUsername(username);
        dataSource.setPassword(password);
        dataSource.setDriverClassName("com.mysql.cj.jdbc.Driver");
        dataSource.setPoolName("transport-resilience-v2-pool");
        dataSource.setMaximumPoolSize(6);
        dataSource.setMinimumIdle(1);
        return dataSource;
    }

    @Bean(name = "v2JdbcTemplate")
    public JdbcTemplate v2JdbcTemplate(@Qualifier("v2DataSource") DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }

    @Bean(name = "v2TransactionManager")
    public PlatformTransactionManager v2TransactionManager(
            @Qualifier("v2DataSource") DataSource dataSource) {
        return new DataSourceTransactionManager(dataSource);
    }
}

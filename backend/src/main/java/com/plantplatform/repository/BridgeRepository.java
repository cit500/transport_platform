package com.plantplatform.repository;

import com.plantplatform.model.Bridge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 桥梁数据访问层
 * JpaRepository 提供内置方法：findAll(), findById(), save(), delete() 等
 */
@Repository
public interface BridgeRepository extends JpaRepository<Bridge, String> {
    List<Bridge> findByStatus(String status);
}